import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
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
import { AiService } from './ai.service';
import { CreateAiTaskDto } from './dto/ai-task.dto';

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
  @ApiOperation({ summary: 'List your AI tasks, newest first.' })
  async listTasks(@Actor() actor: AuthenticatedActor): Promise<PublicAiTask[]> {
    return this.ai.listTasks(actor);
  }

  @Get('tasks/:id')
  @RequirePermissions('AI_TASK_READ')
  @ApiOperation({ summary: 'Read one AI task.' })
  async getTask(
    @Param('id') taskId: string,
    @Actor() actor: AuthenticatedActor,
  ): Promise<PublicAiTask & { output: Record<string, unknown> | null }> {
    return this.ai.getTask(taskId, actor);
  }

  @Get('agents')
  @RequirePermissions('AGENT_READ')
  @ApiOperation({ summary: 'The agent registry and the limits each agent runs under.' })
  async listAgents(): Promise<PublicAiAgent[]> {
    return this.ai.listAgents();
  }
}
