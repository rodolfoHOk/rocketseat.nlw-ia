import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createReadStream } from 'node:fs';
import { prisma } from '../lib/prisma';
import { openAi } from '../lib/openai';

export async function createTranscriptionRoute(app: FastifyInstance) {
  app.post(
    '/videos/:videoId/transcription',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsSchema = z.object({
        videoId: z.string().uuid(),
      });
      const { videoId } = paramsSchema.parse(request.params);

      const bodySchema = z.object({
        prompt: z.string(),
      });
      const { prompt } = bodySchema.parse(request.body);

      const video = await prisma.video.findUniqueOrThrow({
        where: {
          id: videoId,
        },
      });
      const videoPath = video.path;
      const audioReadStream = createReadStream(videoPath);

      const response = await openAi.audio.transcriptions.create({
        file: audioReadStream,
        model: 'whisper-1',
        language: 'pt',
        response_format: 'json',
        temperature: 0,
        prompt,
      });

      const transcription = response.text;

      await prisma.video.update({
        where: {
          id: videoId,
        },
        data: {
          transcription,
        },
      });

      return reply.status(200).send({
        transcription,
      });
    }
  );
}
