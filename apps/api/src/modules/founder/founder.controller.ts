import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SystemMode } from '@molido/database';
import { Actor } from '../../common/decorators/actor.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  clientIp,
  type AuthenticatedActor,
  type MolidoRequest,
} from '../../common/request-context';
import { AiService } from '../ai/ai.service';
import { SystemStateService } from '../system/system-state.service';
import { PauseSystemDto, SecurityFeedQueryDto, TaskListQueryDto } from './dto/founder.dto';
import { FounderService, type FounderOverview, type FounderSecurityFeed } from './founder.service';

/**
 * Founder command centre.
 *
 * Every route declares the permission it requires, and the guard enforces it
 * server-side. A mobile or web client may hide this screen from ordinary
 * users, but that is presentation — the decision is made here.
 */
@ApiTags('founder')
@Controller({ path: 'founder', version: '1' })
export class FounderController {
  constructor(
    private readonly founder: FounderService,
    private readonly systemState: SystemStateService,
    private readonly ai: AiService,
  ) {}

  @Get('overview')
  @RequirePermissions('SYSTEM_READ', 'USER_READ', 'AI_TASK_MANAGE')
  @ApiOperation({ summary: 'Real platform metrics. Zero is reported as zero.' })
  async overview(): Promise<FounderOverview> {
    return this.founder.overview();
  }

  @Get('security')
  @RequirePermissions('SECURITY_READ')
  @ApiOperation({ summary: 'Security event feed, with addresses masked.' })
  async security(@Query() query: SecurityFeedQueryDto): Promise<FounderSecurityFeed> {
    return this.founder.securityFeed(query.limit ?? 50);
  }

  @Get('tasks')
  @RequirePermissions('AI_TASK_MANAGE')
  @ApiOperation({ summary: 'Every AI task, paginated.' })
  async tasks(
    @Query() query: TaskListQueryDto,
    @Actor() actor: AuthenticatedActor,
  ): ReturnType<AiService['listTasks']> {
    return this.ai.listTasks(actor, { page: query.page ?? 1, pageSize: query.pageSize ?? 20 });
  }

  /**
   * Emergency stop.
   *
   * Pausing rejects *new* AI tasks. Queued and running work is left alone —
   * a control that silently destroys in-flight jobs is not a safety feature.
   */
  @Post('pause')
  @RequirePermissions('SYSTEM_MANAGE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop accepting new AI tasks.' })
  async pause(
    @Body() dto: PauseSystemDto,
    @Actor() actor: AuthenticatedActor,
    @Req() request: MolidoRequest,
  ): Promise<{ mode: SystemMode; reason: string | null }> {
    const state = await this.systemState.setMode(SystemMode.PAUSED, actor.userId, {
      reason: dto.reason,
      ipAddress: clientIp(request),
      requestId: request.requestId,
    });
    return { mode: state.mode, reason: state.reason };
  }

  @Post('resume')
  @RequirePermissions('SYSTEM_MANAGE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume accepting AI tasks.' })
  async resume(
    @Actor() actor: AuthenticatedActor,
    @Req() request: MolidoRequest,
  ): Promise<{ mode: SystemMode; reason: string | null }> {
    const state = await this.systemState.setMode(SystemMode.NORMAL, actor.userId, {
      ipAddress: clientIp(request),
      requestId: request.requestId,
    });
    return { mode: state.mode, reason: state.reason };
  }
}
