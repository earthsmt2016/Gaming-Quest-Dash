import { Router, type IRouter } from "express";
import healthRouter from "./health";
import logEntriesRouter from "./logEntries";
import focusInsightsRouter from "./focusInsights";
import dailyPlanRouter from "./dailyPlan";
import completionsRouter from "./completions";
import pausesRouter from "./pauses";
import guidesRouter from "./guides";
import youtubeSearchRouter from "./youtubeSearch";
import savedReportsRouter from "./savedReports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(logEntriesRouter);
router.use(focusInsightsRouter);
router.use(dailyPlanRouter);
router.use(completionsRouter);
router.use(pausesRouter);
router.use(guidesRouter);
router.use(youtubeSearchRouter);
router.use(savedReportsRouter);

export default router;
