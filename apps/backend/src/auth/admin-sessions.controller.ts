import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './decorators/auth.decorators';
import { UserRole } from '../users/entities/user.entity';
import { JWT_SECURITY_SCHEME } from '../openapi/openapi.constants';

@ApiTags('admin')
@ApiBearerAuth(JWT_SECURITY_SCHEME)
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSessionsController {
  constructor(private readonly authService: AuthService) {}

  @Post(':id/sessions/revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke every active session of a user (admin)' })
  revokeAll(
    @Param('id', ParseUUIDPipe) userId: string,
    @Request() req: ExpressRequest & { user: { id: string } },
  ) {
    return this.authService.adminRevokeAllSessions(userId, req.user.id, req.ip);
  }
}
