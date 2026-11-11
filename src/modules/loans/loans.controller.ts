import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProtectedApi } from '../auth/protected-api';
import { LoansService } from './loans.service';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';

export class LoanResultDto extends createZodDto(z.object({
  id: z.string().uuid(), equipmentId: z.string().uuid(), borrowedAt: z.string().datetime(), dueOn: z.string().date(),
})) {}
export class LoanListDto extends createZodDto(z.object({
  id: z.string().uuid(), userId: z.string().uuid().optional(), userName: z.string().optional(), borrowedAt: z.string().datetime(), dueOn: z.string().date(),
  equipment: z.object({ id: z.string(), nome: z.string(), patrimonio: z.string(), categoria: z.string() }),
})) {}
export class ReturnResultDto extends createZodDto(z.object({ id: z.string(), returned: z.boolean(), changed: z.boolean() })) {}

export class CreateLoanDto extends createZodDto(z.object({ equipmentId: z.string().uuid() }).strict()) {}

@ProtectedApi()
@Controller('loans')
export class LoansController {
  constructor(private readonly service: LoansService) {}

  @Post()
  @ApiCreatedResponse({ type: LoanResultDto })
  create(@Body() body: CreateLoanDto) { return this.service.create(body.equipmentId); }

  @Get('mine')
  @ApiOkResponse({ type: LoanListDto, isArray: true })
  mine() { return this.service.list(); }

  @Get('open')
  @ApiOkResponse({ type: LoanListDto, isArray: true })
  open() { return this.service.list(true); }

  @Post(':id/return')
  @ApiCreatedResponse({ type: ReturnResultDto })
  returnItem(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.returnItem(id); }
}
