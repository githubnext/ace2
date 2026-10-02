#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>

void ace_window_setup(void *pointer) {
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)pointer;
		window.opaque = NO;
		window.backgroundColor = NSColor.clearColor;
		window.titlebarAppearsTransparent = YES;
		window.hasShadow = YES;
		window.contentMinSize = NSMakeSize(640, 540);
		NSView *content = window.contentView;
		content.wantsLayer = YES;
		content.layer.cornerRadius = 21;
		content.layer.masksToBounds = YES;
		NSVisualEffectView *effect = [[NSVisualEffectView alloc] initWithFrame:content.bounds];
		effect.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
		effect.material = NSVisualEffectMaterialMenu;
		effect.blendingMode = NSVisualEffectBlendingModeBehindWindow;
		effect.state = NSVisualEffectStateActive;
		[content addSubview:effect positioned:NSWindowBelow relativeTo:content.subviews.firstObject];
		[window invalidateShadow];
	});
}

void ace_window_lights(void *pointer, bool expanded) {
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)pointer;
		// The collapsed navigation rail has room for the close button only.
		for (NSNumber *type in @[@(NSWindowMiniaturizeButton), @(NSWindowZoomButton)]) {
			NSButton *button = [window standardWindowButton:type.integerValue];
			button.alphaValue = expanded ? 1 : 0;
			button.enabled = expanded;
		}
	});
}

void ace_window_zoom(void *pointer) {
	dispatch_sync(dispatch_get_main_queue(), ^{
		[(__bridge NSWindow *)pointer performZoom:nil];
	});
}
