import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtVerifierService } from './jwt-verifier.service';
import { MembershipService } from './membership.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccessContextInterceptor } from './access-context.interceptor';
import { RateLimitService } from '../../http/rate-limit.service';
import { IpLimitGuard, UserLimitInterceptor } from './request-limits';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, JwtVerifierService, JwtAuthGuard, MembershipService, AccessContextInterceptor, RateLimitService, IpLimitGuard, UserLimitInterceptor],
  exports: [AuthRepository, JwtVerifierService, JwtAuthGuard, MembershipService, AccessContextInterceptor, RateLimitService, IpLimitGuard, UserLimitInterceptor],
})
export class AuthModule {}
