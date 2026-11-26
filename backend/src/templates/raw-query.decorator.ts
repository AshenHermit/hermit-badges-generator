import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Query params are described by the template manifest, so they cannot be
 * declared as fixed DTO fields. Read the raw query and validate it against
 * the selected template instead of going through the global ValidationPipe.
 */
export const RawQuery = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Record<string, unknown> => {
    const request = ctx.switchToHttp().getRequest<{ query: Record<string, unknown> }>();
    return request.query;
  },
);
