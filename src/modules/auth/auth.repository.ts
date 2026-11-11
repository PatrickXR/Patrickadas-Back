import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class AuthRepository {
  private readonly admin: SupabaseClient;
  private readonly url: string;
  private readonly serviceRoleKey: string;

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>('SUPABASE_URL');
    this.serviceRoleKey = config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.admin = this.createIsolatedClient();
  }

  private createIsolatedClient(): SupabaseClient {
    return createClient(this.url, this.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  async signIn(email: string, password: string) {
    // signIn changes the client's current session. Never share it across
    // requests or with the privileged client used for membership lookups.
    const client = this.createIsolatedClient();
    return client.auth.signInWithPassword({ email, password });
  }

  async refresh(refreshToken: string) {
    return this.createIsolatedClient().auth.refreshSession({ refresh_token: refreshToken });
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

  async displayName(userId: string): Promise<string> {
    const { data, error } = await this.admin.auth.admin.getUserById(userId);
    if (error || !data.user) return userId;
    const name = data.user.user_metadata?.full_name;
    return typeof name === 'string' && name.trim() ? name : data.user.email ?? userId;
  }
}
