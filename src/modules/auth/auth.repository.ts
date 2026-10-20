import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class AuthRepository {
  private readonly admin: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    this.admin = createClient(
      this.config.getOrThrow<string>('SUPABASE_URL'),
      this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  async signIn(email: string, password: string) {
    return this.admin.auth.signInWithPassword({ email, password });
  }

  async findMembershipRole(userId: string): Promise<string | null> {
    const { data, error } = await this.admin
      .from('memberships')
      .select('role')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data?.role as string | undefined) ?? null;
  }
}
