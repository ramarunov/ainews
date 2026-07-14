import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

// passport-github2 ships no TypeScript types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GitHubStrategy = require('passport-github2').Strategy;

@Injectable()
export class GithubStrategy extends PassportStrategy(GitHubStrategy, 'github') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    // Same placeholder-fallback reasoning as GoogleStrategy: the
    // underlying OAuth2 strategy throws at construction time if
    // clientID/clientSecret are falsy.
    super({
      clientID: config.get<string>('GITHUB_CLIENT_ID') || 'not-configured',
      clientSecret: config.get<string>('GITHUB_CLIENT_SECRET') || 'not-configured',
      callbackURL: `${config.get<string>('API_URL', 'http://localhost:4000')}/api/v1/auth/github/callback`,
      scope: ['user:email'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: (err: Error | null, user?: any) => void,
  ) {
    try {
      const email = profile.emails?.[0]?.value ?? `${profile.username}@users.noreply.github.com`;
      const [firstName, ...rest] = (profile.displayName ?? profile.username ?? 'GitHub User').split(' ');
      const user = await this.authService.findOrCreateOauthUser('github', String(profile.id), {
        email,
        firstName: firstName || 'GitHub',
        lastName: rest.join(' ') || 'User',
        avatarUrl: profile.photos?.[0]?.value,
      });
      done(null, user);
    } catch (err) {
      done(err as Error, undefined);
    }
  }
}
