import { LoansRepository } from './loans.repository';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

@Module({ imports: [AuthModule, PrismaModule], controllers: [LoansController], providers: [LoansService, LoansRepository] })
export class LoansModule {}
