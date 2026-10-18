import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';

export interface JwtPayload {
  sub: string; // user id
  stellarPublicKey: string;
  type: string;
  sid?: string; // session id (refresh_tokens.id)
  iat?: number;
  exp?: number;
  email?: string;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private static readonly LAST_SEEN_INTERVAL_MS = 60 * 1000;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly sessionRepository: Repository<RefreshToken>,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const { sub: userId } = payload;

    const user = await this.userRepository.findOne({
      where: { id: userId },
      // role column is selected by default
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // An erased account is kept only as an anonymised tombstone; it must never
    // be able to authenticate again, even with a previously issued token.
    if (!user.id || user.deletedAt) {
      throw new UnauthorizedException('User account is inactive');
    }

    // Server-side session check: a revoked/expired/removed session invalidates
    // its access tokens immediately instead of waiting for JWT expiry.
    // Tokens minted before sessions were tracked carry no sid and are exempt.
    if (payload.sid) {
      const session = await this.sessionRepository.findOne({
        where: { id: payload.sid, userId },
      });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) {
        throw new UnauthorizedException('Session has been revoked');
      }
      const now = Date.now();
      if (
        !session.lastSeenAt ||
        now - session.lastSeenAt.getTime() > JwtStrategy.LAST_SEEN_INTERVAL_MS
      ) {
        await this.sessionRepository.update(session.id, {
          lastSeenAt: new Date(now),
        });
      }
      (user as User & { sessionId?: string }).sessionId = session.id;
    }

    return user;
  }
}
