import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginRequestDto, LoginResponseDto, RefreshRequestDto } from './dto/login.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import { ValidatedApi } from '../../http/validated-api';
import { IpLimitGuard } from './request-limits';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto> {
    return this.service.login(dto);
  }

  @Post('refresh')
  @ValidatedApi()
  @UseGuards(IpLimitGuard)
  @HttpCode(200)
  @ApiOkResponse({ type: LoginResponseDto })
  refresh(@Body() dto: RefreshRequestDto): Promise<LoginResponseDto> {
    return this.service.refresh(dto.refreshToken);
  }
}
