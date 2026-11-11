import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { LoansModule } from './modules/loans/loans.module';
import { validateEnvironment } from './environment';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }), AuthModule, HealthModule, EquipmentModule, LoansModule],
})
export class AppModule {}
