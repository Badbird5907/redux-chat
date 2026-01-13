import { createFileRoute } from '@tanstack/react-router'
import { createOpenAI } from '@ai-sdk/openai'
import { convertToModelMessages,
streamText,UIMessage } from 'ai'
import { env } from '../../../env'

const openaiClient = createOpenAI({
  apiKey: env.OPENAI_API_KEY,
})

export const Route = createFileRoute('/api/chat/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json() as { messages: UIMessage[] }
        console.log('body', body)

        const result = streamText({
          model: openaiClient('gpt-4o-mini'),
          messages: await convertToModelMessages(body.messages),
        })

        return result.toUIMessageStreamResponse()
      }
    }
  }
})