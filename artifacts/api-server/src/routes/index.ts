import { Router, type IRouter } from "express";
import healthRouter from "./health";
import logEntriesRouter from "./logEntries";
import focusInsightsRouter from "./focusInsights";
import completionsRouter from "./completions";
import pausesRouter from "./pauses";

const router: IRouter = Router();

router.use(healthRouter);
router.use(logEntriesRouter);
router.use(focusInsightsRouter);
router.use(completionsRouter);
router.use(pausesRouter);

export default router;
