import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';
import { VerifyMfaLoginDto } from './dto/verify-mfa-login.dto';
import { DisableMfaDto } from './dto/disable-mfa.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // ─── Register ──────────────────────────────────────────────────────────────
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User created and tokens issued' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── Login ─────────────────────────────────────────────────────────────────
  @Post('login')
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful, tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Req() req: Request, @Body() _dto: LoginDto) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.authService.login(req.user, ipAddress, userAgent);
  }

  // ─── Refresh Token ─────────────────────────────────────────────────────────
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'New tokens issued' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  // ─── OAuth (AUTH-002) ──────────────────────────────────────────────────────
  // The frontend is a token-in-localStorage SPA, not a cookie-session app,
  // so the callback can't just "log the user in" server-side - it redirects
  // to a dedicated frontend page with the issued tokens in the query
  // string, which stores them into the auth store the same way a normal
  // email/password login response does.

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Start Google OAuth login (redirects to Google)' })
  googleAuth() {
    // Guard handles the redirect; nothing to do here.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  googleCallback(@Req() req: Request, @Res() res: Response) {
    this.redirectWithTokens(res, req.user);
  }

  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Start GitHub OAuth login (redirects to GitHub)' })
  githubAuth() {
    // Guard handles the redirect; nothing to do here.
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  githubCallback(@Req() req: Request, @Res() res: Response) {
    this.redirectWithTokens(res, req.user);
  }

  private redirectWithTokens(res: Response, tokens: any) {
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3100');
    const params = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    res.redirect(`${appUrl}/oauth-callback?${params.toString()}`);
  }

  // ─── Password Reset ────────────────────────────────────────────────────────
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 200, description: 'Always returns generic success (does not leak account existence)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.requestPasswordReset(dto.email);
    return { message: 'If that email is registered, a reset link has been sent' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({ summary: 'Reset password using a token from the reset email' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({ status: 400, description: 'Token invalid, expired, or already used' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password updated successfully' };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Change your own password while logged in' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return { message: 'Password updated successfully' };
  }

  // ─── Logout ────────────────────────────────────────────────────────────────
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout (revoke refresh token)' })
  async logout(@CurrentUser() user: any, @Body() dto: RefreshTokenDto) {
    await this.authService.logout(user.id, dto.refreshToken);
  }

  // ─── Logout All ────────────────────────────────────────────────────────────
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout from all devices' })
  async logoutAll(@CurrentUser() user: any) {
    await this.authService.logoutAll(user.id);
  }

  // ─── MFA Status ────────────────────────────────────────────────────────────
  @Get('mfa/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Whether MFA is currently enabled for the current user' })
  async getMfaStatus(@CurrentUser() user: any) {
    return this.authService.getMfaStatus(user.id);
  }

  // ─── MFA Setup ─────────────────────────────────────────────────────────────
  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Initiate MFA setup (returns QR code)' })
  async setupMfa(@CurrentUser() user: any) {
    return this.authService.setupMfa(user.id);
  }

  // ─── MFA Enable ────────────────────────────────────────────────────────────
  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Verify TOTP token and enable MFA' })
  async enableMfa(@CurrentUser() user: any, @Body() dto: VerifyMfaDto) {
    return this.authService.verifyAndEnableMfa(user.id, dto.token);
  }

  // ─── MFA Login Verification ────────────────────────────────────────────────
  @Post('mfa/verify-login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @ApiOperation({ summary: 'Complete login for an MFA-enabled account using the challenge token from /auth/login' })
  async verifyMfaLogin(@Req() req: Request, @Body() dto: VerifyMfaLoginDto) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.authService.verifyMfaLogin(dto.challengeToken, dto.code, ipAddress, userAgent);
  }

  // ─── MFA Disable ───────────────────────────────────────────────────────────
  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Turn MFA off (requires re-entering the current password)' })
  async disableMfa(@CurrentUser() user: any, @Body() dto: DisableMfaDto) {
    await this.authService.disableMfa(user.id, dto.password);
    return { disabled: true };
  }

  // ─── Profile ───────────────────────────────────────────────────────────────
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get current authenticated user' })
  async me(@CurrentUser() user: any) {
    return user;
  }
}
