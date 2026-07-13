// Kept in its own file (not news-intelligence.module.ts) deliberately: the
// module file also imports the service/processor/scheduler that need this
// constant, and @InjectQueue()/@Processor() decorators need the actual
// string value at class-decoration time. Exporting it from the module
// file created a circular import where the constant was still `undefined`
// when those decorators evaluated — @InjectQueue(undefined) silently
// falls back to the DEFAULT unnamed queue token instead of erroring,
// which only surfaced as "Nest can't resolve dependencies... BullQueue_default"
// at boot. Confirmed by reproducing the failure before this fix.
export const NEWS_INGESTION_QUEUE = 'news-ingestion';
