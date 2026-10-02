import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tractatusRouter from "./tractatus";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tractatusRouter);

export default router;
