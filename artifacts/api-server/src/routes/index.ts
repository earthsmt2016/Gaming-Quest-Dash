import { Router, type IRouter } from "express";
import healthRouter from "./health";
import logEntriesRouter from "./logEntries";

const router: IRouter = Router();

router.use(healthRouter);
router.use(logEntriesRouter);

export default router;
