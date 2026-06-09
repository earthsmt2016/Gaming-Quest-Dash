import { openai } from "@workspace/integrations-openai-ai-server";
import { logAiRequest } from "../routes/aiUsage";

export const loggedOpenai = new Proxy(openai, {
  get(target: any, prop: string) {
    const val = target[prop];
    if (prop === "chat" && val) {
      return new Proxy(val, {
        get(cTarget: any, cProp: string) {
          const cVal = cTarget[cProp];
          if (cProp === "completions" && cVal) {
            return new Proxy(cVal, {
              get(crTarget: any, crProp: string) {
                if (crProp === "create") {
                  return async (params: any, options?: any) => {
                    const route = (options as any)?.__route ?? "unknown";
                    const response = await cTarget[cProp].create(params, options);
                    try {
                      const usage = (response as any).usage;
                      if (usage) {
                        await logAiRequest({
                          route,
                          model: params.model ?? "unknown",
                          promptTokens: usage.prompt_tokens ?? 0,
                          completionTokens: usage.completion_tokens ?? 0,
                        });
                      }
                    } catch { /* ignore */ }
                    return response;
                  };
                }
                return crTarget[crProp];
              },
            });
          }
          return cVal;
        },
      });
    }
    return val;
  },
});
