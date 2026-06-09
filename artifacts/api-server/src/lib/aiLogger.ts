import { openai } from "@workspace/integrations-openai-ai-server";
import { logAiRequest } from "../routes/aiUsage";

async function logIfUsage(params: any, response: any, route: string) {
  try {
    const usage = response?.usage;
    if (usage) {
      await logAiRequest({
        route,
        model: params?.model ?? "unknown",
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
      });
    }
  } catch { /* ignore */ }
}

function buildProxy(route: string) {
  return new Proxy(openai, {
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
                      const response = await cTarget[cProp].create(params, options);
                      await logIfUsage(params, response, route);
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
      if (prop === "responses" && val) {
        return new Proxy(val, {
          get(rTarget: any, rProp: string) {
            const rVal = rTarget[rProp];
            if (rProp === "create" && typeof rVal === "function") {
              return async (params: any, options?: any) => {
                const response = await rVal.call(rTarget, params, options);
                await logIfUsage(params, response, route);
                return response;
              };
            }
            return rVal;
          },
        });
      }
      return val;
    },
  });
}

export function aiForRoute(route: string) {
  return buildProxy(route);
}

export const loggedOpenai = buildProxy("unknown");
