import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthRepository } from './auth.repository';
import { LoginRequestDto, LoginResponseDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  async login(dto: LoginRequestDto): Promise<LoginResponseDto> {
    // CA-05: credencial invalida -> erro generico (nao revela se o e-mail existe)
    const { data, error } = await this.repo.signIn(dto.email, dto.password);
    if (error || !data.session || !data.user) {
      throw new UnauthorizedException({
        type: 'about:blank',
        title: 'Credenciais invalidas',
        status: 401,
        detail: 'E-mail ou senha incorretos.',
      });
    }

    const realRole = await this.repo.findMembershipRole(data.user.id);

    // CA-04: papel do botao clicado diferente do membership real -> erro, sem sessao valida
    if (realRole !== dto.expectedRole) {
      throw new ForbiddenException({
        type: 'about:blank',
        title: 'Papel incompativel',
        status: 403,
        detail: 'Este usuario nao tem acesso por este botao.',
      });
    }

    return {
      token: data.session.access_token,
      role: realRole as 'colaborador' | 'operacoes',
      userId: data.user.id,
    };
  }
}
