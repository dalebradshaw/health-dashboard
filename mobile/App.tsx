/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useCallback, useEffect, useState} from 'react';
import {SafeAreaView, StatusBar, StyleSheet, Text, View, Button, FlatList, NativeEventEmitter, NativeModules} from 'react-native';
import AppleHealthKit, {HealthKitPermissions} from 'react-native-health';
import { registerDevice } from './src/api/register';
import { ingestSamples, IngestSample } from './src/api/client';

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
  const userId = 'demo-user'; // TODO: replace with real auth id

  const init = useCallback(() => {
    AppleHealthKit.initHealthKit(permissions, (error) => {
      if (error) {
        setAuthorized(false);
        setStatusText(`HealthKit init error: ${error}`);
        return;
      }
      setAuthorized(true);
      setStatusText('HealthKit authorized');
    });
  }, []);

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
      const res = await ingestSamples({ userId, deviceId: device.deviceId, token: device.token, samples: payload })
      setStatusText(`Uploaded ${res.inserted ?? payload.length} samples`)
    } catch (e: any) {
      setStatusText(`Upload error: ${e?.message ?? e}`)
    }
  }, [device, samples])

  const ensureDevice = useCallback(async () => {
    if (device) return device
    try {
      const d = await registerDevice({ userId, deviceName: 'iPhone' })
      setDevice({ deviceId: d.deviceId, token: d.token })
      return { deviceId: d.deviceId, token: d.token }
    } catch (e: any) {
      setStatusText(`Register error: ${e?.message ?? e}`)
    }
  }, [device])

  useEffect(() => {
    init();
    // fire-and-forget register; ok if it fails in simulator
    ensureDevice();
  }, [init, ensureDevice]);

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
    const s1 = emitter.addListener('healthKit:HeartRate:new', onHR)
    const s2 = emitter.addListener('healthKit:StepCount:new', onSteps)
    const s3 = emitter.addListener('healthKit:HeartRateVariabilitySDNN:new', onHRV)
    const s4 = emitter.addListener('healthKit:ActiveEnergyBurned:new', onAEB)
    return () => { s1.remove(); s2.remove(); s3.remove(); s4.remove(); }
  }, [upload])

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={'dark-content'} />
      <View style={styles.header}>
        <Text style={styles.title}>HealthKit Sandbox</Text>
        <Text style={styles.subtitle}>{statusText}</Text>
      </View>
      <View style={styles.actions}>
        <Button title={authorized ? 'Reload Today' : 'Authorize HealthKit'} onPress={authorized ? loadToday : init} />
      </View>
      <View style={styles.actions}>
        <Button title={device ? 'Upload Samples' : 'Register Device'} onPress={device ? upload : ensureDevice} />
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
