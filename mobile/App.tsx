/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useCallback, useEffect, useState, useRef} from 'react';
import {SafeAreaView, StatusBar, StyleSheet, Text, View, Button, FlatList, NativeEventEmitter, NativeModules, AppState} from 'react-native';
import AppleHealthKit, {HealthKitPermissions} from 'react-native-health';
import { registerDevice } from './src/api/register';
import { IngestSample } from './src/api/client';
import { collectAnchoredSamples } from './src/health/sync';
import { enqueue, flush } from './src/health/queue';
import { loadDevice, saveDevice } from './src/device';
import BackgroundFetch from 'react-native-background-fetch';
import NetInfo from '@react-native-community/netinfo';

type Sample = {
  type: string;
  start: string;
  end: string;
  value: number | string;
  unit?: string;
  uuid?: string;
};

const permissions: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.HeartRate,
      AppleHealthKit.Constants.Permissions.Steps,
      AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
      AppleHealthKit.Constants.Permissions.HeartRateVariability,
      AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
      AppleHealthKit.Constants.Permissions.SleepAnalysis,
    ],
    write: [],
  },
};

function App(): React.JSX.Element {
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [statusText, setStatusText] = useState<string>('');
  const [device, setDevice] = useState<{ deviceId: string; token: string } | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const log = useCallback((msg: string) => setLogs(prev => [new Date().toLocaleTimeString() + ' ' + msg, ...prev].slice(0, 100)), []);
  const userId = 'demo-user'; // TODO: replace with real auth id
  const lastBgSyncRef = useRef<number>(0)

  const init = useCallback(() => {
    AppleHealthKit.initHealthKit(permissions, (error) => {
      if (error) {
        setAuthorized(false);
        setStatusText(`HealthKit init error: ${error}`);
        return;
      }
      setAuthorized(true);
      setStatusText('HealthKit authorized');
      log('HealthKit authorized');
    });
  }, [log]);

  const loadToday = useCallback(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const newSamples: Sample[] = [];

    AppleHealthKit.getHeartRateSamples(
      { startDate: start.toISOString(), endDate: new Date().toISOString(), limit: 50 },
      (err, results) => {
        if (!err && results) {
          results.forEach((r) => newSamples.push({
            type: 'heartRate',
            start: r.startDate,
            end: r.endDate,
            value: r.value,
            uuid: r.id,
            unit: 'count/min',
          }));
          setSamples((prev) => [...newSamples, ...prev]);
        }
      }
    );

    AppleHealthKit.getStepCount({ date: start.toISOString() }, (err, res) => {
      if (!err && res) {
        setSamples((prev) => [
          { type: 'steps', start: start.toISOString(), end: new Date().toISOString(), value: res.value, unit: 'count', uuid: `steps-${start.toISOString().slice(0,10)}` },
          ...prev,
        ]);
      }
    });

    // HRV samples
    AppleHealthKit.getHeartRateVariabilitySamples(
      { startDate: start.toISOString(), endDate: new Date().toISOString(), limit: 50 },
      (err, results) => {
        if (!err && results) {
          const hv: Sample[] = results.map((r: any) => ({ type: 'hrv', start: r.startDate, end: r.endDate, value: r.value, uuid: r.id, unit: 'ms' }))
          if (hv.length) setSamples((prev) => [...hv, ...prev])
        }
      }
    );

    // Active energy burned (sum today)
    AppleHealthKit.getActiveEnergyBurned(
      { startDate: start.toISOString(), endDate: new Date().toISOString(), ascending: true, limit: 500 },
      (err, results) => {
        if (!err && Array.isArray(results)) {
          const sum = results.reduce((a: number, r: any) => a + (Number(r.value) || 0), 0)
          setSamples((prev) => [
            { type: 'activeEnergyBurned', start: start.toISOString(), end: new Date().toISOString(), value: sum, unit: 'kcal', uuid: `aeb-${start.toISOString().slice(0,10)}` },
            ...prev,
          ])
        }
      }
    )
  }, []);

  const upload = useCallback(async () => {
    if (!device) {
      setStatusText('No device registered');
      return;
    }
    const payload: IngestSample[] = samples.map((s) => ({
      type: s.type,
      unit: s.unit,
      start: s.start,
      end: s.end,
      value: s.value,
    }))
    try {
      await enqueue(payload)
      const res = await flush({ userId, deviceId: device.deviceId, token: device.token })
      setStatusText(`Queued ${payload.length}, sent ${res.sent}, remaining ${res.remaining}`)
      if (res.sent > 0) { setLastSyncAt(new Date().toLocaleTimeString()); log(`Flushed ${res.sent} samples`) }
    } catch (e: any) {
      const m = `Upload error: ${e?.message ?? e}`; setStatusText(m); log(m)
    }
  }, [device, samples])

  const anchoredSync = useCallback(async () => {
    if (!device) return
    try {
      const result = await collectAnchoredSamples()
      await enqueue(result.samples, result.anchors, result.deletes)
      const res = await flush({ userId, deviceId: device.deviceId, token: device.token })
      setStatusText(`Synced ${result.samples.length}; sent ${res.sent}, remaining ${res.remaining}`)
      if (res.sent > 0) { setLastSyncAt(new Date().toLocaleTimeString()); log(`Synced ${res.sent} samples`) }
    } catch (e: any) {
      const m = `Sync error: ${e?.message ?? e}`; setStatusText(m); log(m)
    }
  }, [device, log])

  useEffect(() => {
    // Background Fetch: run anchored sync opportunistically
    const setup = async () => {
      try {
        await BackgroundFetch.configure({ minimumFetchInterval: 15, enableHeadless: false, startOnBoot: true, stopOnTerminate: false }, async (taskId) => {
          log(`BGFetch event: ${taskId}`)
          if (device) {
            const now = Date.now()
            if (now - lastBgSyncRef.current > 5 * 60 * 1000) {
              await anchoredSync()
              lastBgSyncRef.current = now
            }
          }
          BackgroundFetch.finish(taskId)
        }, (e) => log(`BGFetch configure error: ${e}`))
        await BackgroundFetch.start()
        log('BGFetch started')
      } catch (e: any) {
        log(`BGFetch error: ${e?.message ?? e}`)
      }
    }
    setup()
  }, [device, anchoredSync, log])

  useEffect(() => {
    // Network-aware flush: when connection is regained, try flushing
    const unsub = NetInfo.addEventListener(async (state) => {
      if (state.isConnected && device) {
        const res = await flush({ userId, deviceId: device.deviceId, token: device.token })
        if (res.sent > 0) { setLastSyncAt(new Date().toLocaleTimeString()); log(`NetInfo flush sent ${res.sent}`) }
      }
    })
    return () => unsub()
  }, [device, log])

  const ensureDevice = useCallback(async () => {
    if (device) return device
    // Load from AsyncStorage (no Keychain)
    const stored = await loadDevice()
    if (stored) { setDevice(stored); return stored }
    try {
      const d = await registerDevice({ userId, deviceName: 'iPhone' })
      const creds = { deviceId: d.deviceId, token: d.token }
      await saveDevice(creds)
      setDevice(creds)
      return creds
    } catch (e: any) {
      const m = `Register error: ${e?.message ?? e}`; setStatusText(m); log(m)
    }
  }, [device, log])

  useEffect(() => {
    init();
    // fire-and-forget register; ok if it fails in simulator
    ensureDevice().then(async (d) => {
      if (d) {
        // Auto-flush on app start
        const res = await flush({ userId, deviceId: d.deviceId, token: d.token })
        if (res.sent > 0) { setLastSyncAt(new Date().toLocaleTimeString()); log(`Auto-flush sent ${res.sent}`) }
      }
    });
    // Request native authorization as well
    try {
      const Native = (NativeModules as any)?.HealthAnchorsModule
      if (Native?.requestAuthorization) {
        Native.requestAuthorization(['heartRate','hrv','steps','activeEnergyBurned']).catch(() => {})
      }
    } catch {}
  }, [init, ensureDevice, log]);

  useEffect(() => {
    // Periodic flush every 5 minutes while app is foregrounded
    let interval: any
    const startInterval = () => {
      if (interval || !device) return
      interval = setInterval(async () => {
        const res = await flush({ userId, deviceId: device.deviceId, token: device.token })
        if (res.sent > 0) { setLastSyncAt(new Date().toLocaleTimeString()); log(`Periodic flush sent ${res.sent}`) }
      }, 5 * 60 * 1000)
    }
    const stopInterval = () => { if (interval) { clearInterval(interval); interval = null } }
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') startInterval(); else stopInterval() })
    startInterval()
    return () => { stopInterval(); sub.remove() }
  }, [device, log])

  useEffect(() => {
    // Background observers from react-native-health
    const emitter = new NativeEventEmitter((NativeModules as any).AppleHealthKit);
    const onHR = () => {
      const start = new Date();
      start.setHours(start.getHours() - 1); // fetch last 1h on event
      AppleHealthKit.getHeartRateSamples(
        { startDate: start.toISOString(), endDate: new Date().toISOString(), limit: 200 },
        (err, results) => {
          if (!err && results) {
            const news: Sample[] = results.map((r: any) => ({ type: 'heartRate', start: r.startDate, end: r.endDate, value: r.value, uuid: r.id, unit: 'count/min' }))
            if (news.length) {
              setSamples((prev) => [...news, ...prev])
              // trigger upload in background
              setTimeout(() => upload(), 0)
            }
          }
        }
      )
    }
    const onSteps = () => {
      const start = new Date();
      start.setHours(0,0,0,0)
      AppleHealthKit.getStepCount({ date: start.toISOString() }, (err, res) => {
        if (!err && res) {
          const s: Sample = { type: 'steps', start: start.toISOString(), end: new Date().toISOString(), value: res.value, unit: 'count', uuid: `steps-${start.toISOString().slice(0,10)}` }
          setSamples((prev) => [s, ...prev])
          setTimeout(() => upload(), 0)
        }
      })
    }
    const onHRV = () => {
      const start = new Date();
      start.setHours(start.getHours() - 1);
      AppleHealthKit.getHeartRateVariabilitySamples(
        { startDate: start.toISOString(), endDate: new Date().toISOString(), limit: 200 },
        (err, results) => {
          if (!err && results) {
            const hv: Sample[] = results.map((r: any) => ({ type: 'hrv', start: r.startDate, end: r.endDate, value: r.value, uuid: r.id, unit: 'ms' }))
            if (hv.length) {
              setSamples((prev) => [...hv, ...prev])
              setTimeout(() => upload(), 0)
            }
          }
        }
      )
    }
    const onAEB = () => {
      const start = new Date();
      start.setHours(0,0,0,0)
      AppleHealthKit.getActiveEnergyBurned(
        { startDate: start.toISOString(), endDate: new Date().toISOString(), ascending: true, limit: 500 },
        (err, results) => {
          if (!err && Array.isArray(results)) {
            const sum = results.reduce((a: number, r: any) => a + (Number(r.value) || 0), 0)
            const s: Sample = { type: 'activeEnergyBurned', start: start.toISOString(), end: new Date().toISOString(), value: sum, unit: 'kcal', uuid: `aeb-${start.toISOString().slice(0,10)}` }
            setSamples((prev) => [s, ...prev])
            setTimeout(() => upload(), 0)
          }
        }
      )
    }
    const s1 = emitter.addListener('healthKit:HeartRate:new', () => { onHR(); anchoredSync(); })
    const s2 = emitter.addListener('healthKit:StepCount:new', () => { onSteps(); anchoredSync(); })
    const s3 = emitter.addListener('healthKit:HeartRateVariabilitySDNN:new', () => { onHRV(); anchoredSync(); })
    const s4 = emitter.addListener('healthKit:ActiveEnergyBurned:new', () => { onAEB(); anchoredSync(); })
    return () => { s1.remove(); s2.remove(); s3.remove(); s4.remove(); }
  }, [upload, anchoredSync])

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={'dark-content'} />
      <View style={styles.header}>
        <Text style={styles.title}>HealthKit Sandbox</Text>
        <Text style={styles.subtitle}>{statusText}{lastSyncAt ? ` • Last sync ${lastSyncAt}` : ''}</Text>
      </View>
      <View style={styles.actions}>
        <Button title={authorized ? 'Reload Today' : 'Authorize HealthKit'} onPress={authorized ? loadToday : init} />
      </View>
      <View style={styles.actions}>
        <Button title={device ? 'Upload Samples' : 'Register Device'} onPress={device ? upload : ensureDevice} />
      </View>
      <View style={styles.actions}>
        <Button title="Sync Now" onPress={anchoredSync} disabled={!device} />
      </View>
      <FlatList
        data={samples}
        keyExtractor={(_, idx) => String(idx)}
        renderItem={({item}) => (
          <View style={styles.row}>
            <Text style={styles.rowType}>{item.type}</Text>
            <Text style={styles.rowValue}>{String(item.value)} {item.unit ?? ''}</Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={styles.list}
      />
      <View style={{padding:16}}>
        <Text style={{fontWeight:'600'}}>Logs</Text>
        {logs.slice(0,6).map((l, i) => (<Text key={i} style={{color:'#666', fontSize:12}}>{l}</Text>))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { marginTop: 4, color: '#666' },
  actions: { paddingHorizontal: 16, paddingBottom: 8 },
  list: { padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowType: { fontWeight: '500' },
  rowValue: { color: '#111' },
  sep: { height: 8 },
});

export default App;
