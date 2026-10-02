import { createContext } from "react";
import type { ExecActionHandler } from "./system-layout";

const ExecActionContext = createContext<ExecActionHandler | null>(null);
const ExecActionProvider = ExecActionContext.Provider;

export { ExecActionContext, ExecActionProvider };
