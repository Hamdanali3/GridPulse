/**
 * Ambient type definitions for Supabase Deno Edge Functions
 * Resolves Deno globals and npm: specifiers in TypeScript language servers and IDEs.
 */

declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): Record<string, string>;
  }

  export const env: Env;

  export interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
    onError?: (error: unknown) => Response | Promise<Response>;
    onListen?: (params: { hostname: string; port: number }) => void;
  }

  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: ServeOptions,
  ): void;
}

declare module 'npm:postgres@3.4.5' {
  interface SqlOptions {
    max?: number;
    idle_timeout?: number;
    connect_timeout?: number;
    prepare?: boolean;
    ssl?: boolean | 'require' | 'allow' | 'prefer' | Record<string, unknown>;
  }

  interface SqlInstance {
    <T extends readonly any[] = any[]>(
      template: TemplateStringsArray,
      ...parameters: any[]
    ): Promise<T>;
    json(value: unknown): any;
  }

  function postgres(url: string, options?: SqlOptions): SqlInstance;
  export default postgres;
}

declare module 'npm:groq-sdk@0.9.0' {
  namespace Groq {
    namespace Chat {
      namespace Completions {
        type ChatCompletionMessageParam = any;
        type ChatCompletionTool = any;
        type ChatCompletion = any;
        type ChatCompletionChunk = any;
      }
    }
  }

  class Groq {
    constructor(options?: Record<string, unknown>);
    chat: {
      completions: {
        create(params: Record<string, unknown>, options?: Record<string, unknown>): Promise<any>;
      };
    };
  }
  export default Groq;
}

declare module 'npm:*' {
  const content: any;
  export default content;
}
