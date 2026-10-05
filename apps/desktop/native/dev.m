#import <AppKit/AppKit.h>
#import <signal.h>

int main(int argc, const char *argv[]) {
	@autoreleasepool {
		if (argc != 2) {
			fprintf(stderr, "Usage: ace-dev-launcher <app>\n");
			return 1;
		}
		NSURL *url = [NSURL fileURLWithPath:@(argv[1]) isDirectory:YES].URLByResolvingSymlinksInPath;
		__block NSRunningApplication *application = nil;
		__block BOOL stopping = NO;
		__block BOOL finished = NO;
		__block int result = 0;
		void (^stop)(void) = ^{
			stopping = YES;
			if (application && !application.terminated && ![application terminate]) {
				fprintf(stderr, "Could not request Ace-dev to quit. Quit Ace-dev to stop this run.\n");
			}
		};
		const int signals[] = {SIGINT, SIGTERM};
		dispatch_source_t sources[2];
		for (int i = 0; i < 2; i++) {
			signal(signals[i], SIG_IGN);
			sources[i] = dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL, signals[i], 0, dispatch_get_main_queue());
			dispatch_source_set_event_handler(sources[i], stop);
			dispatch_resume(sources[i]);
		}
		NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
		configuration.createsNewApplicationInstance = YES;
		configuration.allowsRunningApplicationSubstitution = NO;
		configuration.environment = NSProcessInfo.processInfo.environment;
		// LaunchServices makes Ace, rather than the invoking terminal, responsible for its permissions.
		[NSWorkspace.sharedWorkspace openApplicationAtURL:url configuration:configuration
			completionHandler:^(NSRunningApplication *app, NSError *error) {
				dispatch_async(dispatch_get_main_queue(), ^{
					if (error || !app) {
						fprintf(stderr, "Could not launch Ace-dev: %s\n", error.localizedDescription.UTF8String ?: "no application returned");
						result = 1;
						finished = YES;
						return;
					}
					if (![app.bundleURL.URLByResolvingSymlinksInPath isEqual:url]) {
						fprintf(stderr, "LaunchServices returned another application; leaving it untouched.\n");
						result = 1;
						finished = YES;
						return;
					}
					application = app;
					printf("Ace-dev launched PID %d from %s\n", app.processIdentifier, url.path.UTF8String);
					fflush(stdout);
					if (stopping) stop();
				});
			}];
		// NSRunningApplication refreshes termination state between main run-loop turns.
		NSTimer *timer = [NSTimer scheduledTimerWithTimeInterval:0.1 repeats:YES block:^(NSTimer *timer) {
			if (application.terminated) finished = YES;
		}];
		while (!finished) {
			@autoreleasepool {
				[NSRunLoop.mainRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
			}
		}
		[timer invalidate];
		for (int i = 0; i < 2; i++) dispatch_source_cancel(sources[i]);
		return result;
	}
}
