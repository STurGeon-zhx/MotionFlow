import {ZodError} from 'zod';

export function ok(data: Record<string, unknown>, init?: ResponseInit) {
  return Response.json({success: true, ...data}, init);
}

export function errorResponse(error: unknown, status = 400) {
  if (error instanceof ZodError) {
    return Response.json({success: false, error: error.issues[0]?.message ?? '参数校验失败', issues: error.issues}, {status});
  }
  const message = error instanceof Error ? error.message : '请求处理失败';
  return Response.json({success: false, error: message}, {status});
}

