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
import storageRouter from "./storage";
import screenshotAnalysisRouter from "./screenshotAnalysis";
import platformsRouter from "./platforms";
import questsRouter from "./quests";
import companionRouter from "./companion";

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
router.use(storageRouter);
router.use(screenshotAnalysisRouter);
router.use(platformsRouter);
router.use(questsRouter);
router.use(companionRouter);

export default router;
