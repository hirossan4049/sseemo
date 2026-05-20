#import "AppDelegate.h"
#import <BackgroundTasks/BackgroundTasks.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // Expo's `registerRootComponent` registers the app under the name "main".
  // Keep this in sync with `registerRootComponent(App)` in index.js.
  self.moduleName = @"main";
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

// Forward custom URL scheme deeplinks (secstorage://, secstoragedev://) to
// RCTLinkingManager so the JS Linking listener fires. Without this, the
// dev-onboard flow used by Maestro E2E silently no-ops.
- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options
{
  return [RCTLinkingManager application:application openURL:url options:options];
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
