#import <Foundation/Foundation.h>
#import <ServiceManagement/ServiceManagement.h>

static NSString *lastError = @"";

int ace_helper_status(const char *plist) {
	@autoreleasepool {
		return (int)[SMAppService agentServiceWithPlistName:@(plist)].status;
	}
}

const char *ace_helper_register(const char *plist) {
	@autoreleasepool {
		NSError *error = nil;
		[[SMAppService agentServiceWithPlistName:@(plist)] registerAndReturnError:&error];
		lastError = error ? error.localizedDescription : @"";
		return lastError.UTF8String;
	}
}

const char *ace_helper_unregister(const char *plist) {
	@autoreleasepool {
		NSError *error = nil;
		[[SMAppService agentServiceWithPlistName:@(plist)] unregisterAndReturnError:&error];
		lastError = error ? error.localizedDescription : @"";
		return lastError.UTF8String;
	}
}

void ace_helper_settings(void) {
	@autoreleasepool {
		[SMAppService openSystemSettingsLoginItems];
	}
}
