import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthRepository } from './auth.repository';
import { LoginRequestDto, LoginResponseDto } from './dto/login.dto';
import { JwtVerifierService } from './jwt-verifier.service';
import { MembershipService } from './membership.service';

@Injectable()
export class AuthService {
  constructor(private readonly repo: AuthRepository,
    private readonly verifier: JwtVerifierService,
    private readonly memberships: MembershipService) {}

  async refresh(refreshToken: string): Promise<LoginResponseDto> {
    const { data, error } = await this.repo.refresh(refreshToken);
    if (error || !data.session || !data.user) throw new UnauthorizedException('Sessão expirada');
    const identity = await this.verifier.verify(data.session.access_token);
    if (identity.userId !== data.user.id) throw new UnauthorizedException('Sessão inválida');
    const membership = await this.memberships.resolve(identity);
    return { token: data.session.access_token, refreshToken: data.session.refresh_token,
      role: membership.role, userId: identity.userId };
  }

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
        detail: realRole === 'operacoes' && dto.expectedRole === 'colaborador'
          ? 'Sua conta é de Operações. Use o botão “Entrar como Operações”.'
          : 'Este usuario nao tem acesso por este botao.',
      });
    }

    return {
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      role: realRole as 'colaborador' | 'operacoes',
      userId: data.user.id,
    };
  }
}
