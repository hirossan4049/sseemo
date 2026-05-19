#import "AppDelegate.h"
#import <BackgroundTasks/BackgroundTasks.h>
#import <React/RCTBundleURLProvider.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"SecStorage";
  self.initialProps = @{};

  // バックグラウンドフェッチで写真自動取り込み
  [[BGTaskScheduler sharedScheduler]
    registerForTaskWithIdentifier:@"app.secstorage.autoimport"
    usingQueue:nil
    launchHandler:^(BGTask * _Nonnull task) {
      [self handleAutoImport:(BGProcessingTask *)task];
    }];

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (void)handleAutoImport:(BGProcessingTask *)task
{
  // JS 側 runAutoImport は AppState 'active' 時に走る。
  // バックグラウンドでは NSURLSession Background が継続する設計なので、
  // ここでは次回起動をスケジュールするだけ。
  [task setTaskCompletedWithSuccess:YES];
  [self scheduleAutoImport];
}

- (void)scheduleAutoImport
{
  BGProcessingTaskRequest *req = [[BGProcessingTaskRequest alloc]
    initWithIdentifier:@"app.secstorage.autoimport"];
  req.requiresNetworkConnectivity = YES;
  req.earliestBeginDate = [NSDate dateWithTimeIntervalSinceNow:60 * 30];
  [[BGTaskScheduler sharedScheduler] submitTaskRequest:req error:nil];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
