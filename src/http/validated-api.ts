import { applyDecorators, UseFilters, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { ProblemDetailsFilter } from './problem-details.filter';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class ProblemDetailsDto extends createZodDto(z.object({
  type: z.literal('about:blank'), title: z.string(), status: z.number().int(),
  code: z.string().optional(), detail: z.string().optional(),
}).strict()) {}

export function ValidatedApi() {
  return applyDecorators(UsePipes(ZodValidationPipe), UseFilters(ProblemDetailsFilter),
    ApiExtraModels(ProblemDetailsDto),
    ...[400, 401, 403, 404, 409, 429, 500].map(status => ApiResponse({ status,
      content: { 'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } },
      ...(status === 429 ? { headers: { 'Retry-After': {
        description: 'Segundos até a próxima janela de requisições.', schema: { type: 'integer', minimum: 1 },
      } } } : {}),
    })),
  );
}
