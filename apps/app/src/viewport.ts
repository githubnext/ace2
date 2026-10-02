/**
 * Phones overlay the keyboard on the page instead of resizing it, so the composer would sit
 * underneath. Size the app to the visible viewport and mark when a keyboard takes the space.
 */
const viewport = window.visualViewport;
// Android resizes the layout viewport for the keyboard too, so compare with the tallest height
// seen at this width rather than with innerHeight.
let width = 0;
let tallest = 0;

function update() {
	if (!viewport) return;
	const root = document.documentElement;
	root.style.setProperty("--viewport-height", `${viewport.height}px`);
	if (viewport.width !== width) {
		width = viewport.width;
		tallest = 0;
	}
	tallest = Math.max(tallest, viewport.height);
	// A keyboard takes far more than browser chrome does when it collapses.
	root.toggleAttribute("data-keyboard", tallest - viewport.height > 150);
	// iOS scrolls the whole page to reveal a focused field; the app already keeps it visible.
	if (viewport.offsetTop) window.scrollTo(0, 0);
}

viewport?.addEventListener("resize", update);
viewport?.addEventListener("scroll", update);
update();
