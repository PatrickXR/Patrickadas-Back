import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProtectedApi } from '../auth/protected-api';
import { EquipmentService } from './equipment.service';
import { ApiCreatedResponse, ApiOkResponse, ApiQuery } from '@nestjs/swagger';

export class EquipmentInputDto extends createZodDto(z.object({
  nome: z.string().trim().min(1).max(160), patrimonio: z.string().trim().min(1).max(80),
  categoria: z.enum(['notebook','monitor','cabo','camera']), situacao: z.enum(['disponivel','manutencao']),
  observacoes: z.string().trim().max(2000).optional(),
}).strict()) {}
export class EquipmentResultDto extends createZodDto(z.object({ id: z.string() })) {}

export class CatalogResponseDto extends createZodDto(z.object({
  total: z.number(), available: z.number(), maintenance: z.number(), nextCursor: z.string().nullable(),
  items: z.array(z.object({ id: z.string(), nome: z.string(), patrimonio: z.string(), categoria: z.string(),
    status: z.string(), isMine: z.boolean(), imageUrl: z.string().nullable(), observacoes: z.string().nullable() })),
})) {}

export class CatalogQueryDto extends createZodDto(z.object({
  q: z.string().trim().max(120).default(''),
  status: z.enum(['all', 'disponivel', 'emprestado', 'manutencao']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  cursor: z.string().uuid().optional(),
}).strict()) {}

@ProtectedApi()
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly service: EquipmentService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['all', 'disponivel', 'emprestado', 'manutencao'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ type: CatalogResponseDto })
  list(@Query() query: CatalogQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiCreatedResponse({ type: EquipmentResultDto })
  create(@Body() input: EquipmentInputDto) { return this.service.manage(input); }

  @Put(':id')
  @ApiOkResponse({ type: EquipmentResultDto })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: EquipmentInputDto) { return this.service.manage(input, id); }

  @Delete(':id')
  @ApiOkResponse({ type: EquipmentResultDto })
  remove(@Param('id', new ParseUUIDPipe()) id: string) { return this.service.manage(null, id); }
}
