#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import "RCTAppleHealthKit.h"
#import <HealthKit/HealthKit.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"mobile";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  BOOL ok = [super application:application didFinishLaunchingWithOptions:launchOptions];
  // Initialize react-native-health background observers through the library
  if (self.bridge) {
    [[RCTAppleHealthKit new] initializeBackgroundObservers:self.bridge];
  }
  return ok;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self getBundleURL];
}

- (NSURL *)getBundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
