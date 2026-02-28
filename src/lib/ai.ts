import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

/**
 * Generates smart reply suggestions for a chat thread.
 * 
 * @param lastMessages - The last few messages in the conversation
 * @param context - Context about the trip request or booking (service type, status, etc.)
 */
export async function generateSmartReplies(
  lastMessages: { role: 'user' | 'assistant'; content: string }[],
  context: { 
    serviceType: string; 
    status: string; 
    role: 'operator' | 'user';
    operatorName?: string;
    userName?: string;
  }
) {
  const prompt = `
    You are an AI assistant for Businto, a transportation marketplace. 
    You are helping ${context.role === 'operator' ? 'a transportation operator' : 'a customer'} respond to a message.
    
    CONTEXT:
    - Service Type: ${context.serviceType}
    - Request Status: ${context.status}
    - Operator Name: ${context.operatorName || 'The Operator'}
    - Customer Name: ${context.userName || 'The Customer'}
    
    CONVERSATION HISTORY:
    ${lastMessages.map(m => `${m.role === 'assistant' ? 'AI Suggestion Target' : 'Other Party'}: ${m.content}`).join('\n')}
    
    GOAL:
    Generate 3 short, professional, and helpful reply suggestions (max 15 words each).
    Format the response as a JSON array of strings.
    
    Suggestions should:
    1. Be actionable (e.g., confirming availability, asking for more info, or providing a status update).
    2. Maintain a friendly but business-professional tone.
    3. Be specific to the ${context.serviceType} context.
  `;

  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
      system: 'You are a helpful transportation marketplace assistant. Only output a valid JSON array of strings.',
    });

    // Parse the JSON array
    const suggestions = JSON.parse(text.trim());
    return Array.isArray(suggestions) ? suggestions.slice(0, 3) : [];
  } catch (error) {
    console.error('AI Suggestion Error:', error);
    return [];
  }
}
