import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { toUserResponse } from './mappers/user-response.mapper';
import type {
  TokenResponse,
  UserResponse,
} from './mappers/user-response.mapper';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('google')
  googleAuth(@Body() dto: GoogleAuthDto): Promise<TokenResponse> {
    return this.authService.googleLogin(dto.token);
  }

  @Get('me')
  me(@CurrentUser() user: User): UserResponse {
    return toUserResponse(user);
  }

  @Get('me/features')
  meFeatures(
    @CurrentUser() user: User,
  ): Promise<{ features: Record<string, unknown> }> {
    return this.authService.getFeatures(user.id);
  }
}
