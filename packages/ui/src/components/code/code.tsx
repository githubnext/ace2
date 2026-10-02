import { type ComponentPropsWithRef, useEffect, useState } from "react";

import { cached, highlight } from "../../lib/highlighter";
import { cn } from "../../lib/utils";

type CodeProps = ComponentPropsWithRef<"div"> & {
	/** Code source to render. Whitespace is preserved verbatim. */
	source: string;
	/** Language hint forwarded to Shiki. Falls back to `text` when omitted. */
	language?: string;
};

/** Read-only syntax-highlighted code block powered by Shiki. */
function Code({ source, language, className, ref, ...props }: CodeProps) {
	let [state, setState] = useState<
		{
			source: string;
			language?: string;
			html: string;
		} | null
	>(() => {
		let html = cached(source, language);
		return html ? { source, language, html } : null;
	});

	useEffect(() => {
		let cancelled = false;
		highlight(source, language).then(h => {
			if (!cancelled) setState({ source, language, html: h });
		});
		return () => {
			cancelled = true;
		};
	}, [source, language]);

	return (
		<div
			ref={ref}
			className={cn(
				"font-mono tab-4 overflow-x-auto select-text contain-content [&_*]:select-text [&_pre]:!m-0 [&_pre]:whitespace-pre [&_.shiki]:!bg-transparent [&_.shiki]:!p-0 [&_.shiki]:!font-[inherit]",
				className,
			)}
			{...props}
		>
			{state && state.source === source && state.language === language
				? <div dangerouslySetInnerHTML={{ __html: state.html }} />
				: <pre>{source}</pre>}
		</div>
	);
}

export { Code };
export type { CodeProps };
