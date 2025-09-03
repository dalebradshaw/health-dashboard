#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HealthAnchorsModule, NSObject)

RCT_EXTERN_METHOD(requestAuthorization:(NSArray *)types resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(sync:(NSArray *)types resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(commitAnchor:(NSString *)type token:(NSString *)token resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
