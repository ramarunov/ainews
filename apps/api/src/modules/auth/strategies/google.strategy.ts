import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    // passport-oauth2's constructor throws synchronously if clientID/
    // clientSecret are falsy, which would crash Nest's DI container at
    // boot. Falling back to a placeholder string (never a real one, so a
    // login attempt correctly fails against Google rather than silently
    // "working") keeps the app bootable with no OAuth app configured yet -
    // same pattern as the AI provider clients elsewhere in this project.
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || 'not-configured',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || 'not-configured',
      callbackURL: `${config.get<string>('API_URL', 'http://localhost:4000')}/api/v1/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    try {
      const email = profile.emails?.[0]?.value;
      const user = await this.authService.findOrCreateOauthUser('google', profile.id, {
        email,
        firstName: profile.name?.givenName ?? profile.displayName ?? 'Google',
        lastName: profile.name?.familyName ?? 'User',
        avatarUrl: profile.photos?.[0]?.value,
      });
      done(null, user);
    } catch (err) {
      done(err as Error, undefined);
    }
  }
}
