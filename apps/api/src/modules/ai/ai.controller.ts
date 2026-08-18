import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AiTaskStatus } from '@molido/database';
import type { PublicAiAgent, PublicAiTask } from '@molido/types';
import { Actor } from '../../common/decorators/actor.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  clientIp,
  clientUserAgent,
  type AuthenticatedActor,
  type MolidoRequest,
} from '../../common/request-context';
import { AiService, type PagedTasks } from './ai.service';
import { CreateAiTaskDto, ListAiTasksDto } from './dto/ai-task.dto';

export interface CreateAiTaskResponse {
  taskId: string;
  status: AiTaskStatus;
  output: Record<string, unknown> | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

@ApiTags('ai')
@Controller({ path: 'ai', version: '1' })
export class AiController {
  constructor(private readonly ai: AiService) {}

  /**
   * Submit a goal.
   *
   * Runs synchronously for now and returns COMPLETED or FAILED. The response
   * shape already carries `taskId` and `status`, so moving execution onto the
   * BullMQ queue later becomes a change of status value — PENDING — and not a
   * change of contract.
   *
   * Throughput is bounded by the agent's own `maxTasksPerHour` budget in the
   * orchestrator, which is the meaningful limit here: it survives across
   * sessions and addresses, where an HTTP-level counter would not.
   */
  @Post('tasks')
  @RequirePermissions('AI_TASK_CREATE')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a goal to the AI orchestrator.' })
  async createTask(
    @Body() dto: CreateAiTaskDto,
    @Actor() actor: AuthenticatedActor,
    @Req() request: MolidoRequest,
  ): Promise<CreateAiTaskResponse> {
    return this.ai.createTask({
      userId: actor.userId,
      goal: dto.input,
      agentKey: dto.agent,
      actorPermissions: actor.permissions,
      ipAddress: clientIp(request),
      userAgent: clientUserAgent(request),
      requestId: request.requestId,
    });
  }

  @Get('tasks')
  @RequirePermissions('AI_TASK_READ')
  @ApiOperation({ summary: 'List your AI tasks, newest first. Paginated.' })
  async listTasks(
    @Query() query: ListAiTasksDto,
    @Actor() actor: AuthenticatedActor,
  ): Promise<PagedTasks> {
    return this.ai.listTasks(actor, { page: query.page, pageSize: query.pageSize });
  }

  @Get('tasks/:id')
  @RequirePermissions('AI_TASK_READ')
  @ApiOperation({ summary: 'Read one AI task.' })
  async getTask(
    @Param('id', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Actor() actor: AuthenticatedActor,
  ): Promise<PublicAiTask & { output: Record<string, unknown> | null }> {
    return this.ai.getTask(taskId, actor);
  }

  /**
   * Cancel a task.
   *
   * Only PENDING and RUNNING tasks can be cancelled; anything finished is left
   * as it is, and the response says whether the cancellation actually applied
   * rather than reporting success either way.
   */
  @Post('tasks/:id/cancel')
  @RequirePermissions('AI_TASK_CANCEL')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending or running task.' })
  async cancelTask(
    @Param('id', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Actor() actor: AuthenticatedActor,
    @Req() request: MolidoRequest,
  ): Promise<{ cancelled: boolean }> {
    const cancelled = await this.ai.cancelTask(taskId, actor, {
      ipAddress: clientIp(request),
      userAgent: clientUserAgent(request),
      requestId: request.requestId,
    });
    return { cancelled };
  }

  @Get('agents')
  @RequirePermissions('AGENT_READ')
  @ApiOperation({ summary: 'The agent registry and the limits each agent runs under.' })
  async listAgents(): Promise<PublicAiAgent[]> {
    return this.ai.listAgents();
  }
}
