
"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Send, Brain} from "lucide-react"
import "katex/dist/katex.min.css"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import type { Message } from "./types"
import MobileApp from "./mobile-app"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_ENDPOINTS_ASK = import.meta.env.VITE_API_ENDPOINTS_ASK;
const API_ENDPOINTS_RENDER_GRAPH = import.meta.env.VITE_API_ENDPOINTS_RENDER_GRAPH;
// const ENABLE_DEBUG_MODE = import.meta.env.VITE_ENABLE_DEBUG_MODE === "true";


const preprocessLaTeX = (input: string): string => {
  if (!input) return ""
  let output = input

  // Mathematical expressions and symbols
  const replacements: [RegExp, string][] = [
    // Fractions with more complex patterns
    [/\\?frac/g, "\\frac"],
    [/([0-9a-zA-Z.]+)\/([0-9a-zA-Z.]+)(?!\})/g, "\\frac{$1}{$2}"],
    
    // Limits and special notation
    [/lim_\{([^}]+)\s*(?:->|→|to|o)\s*([^}]+)\}/g, "\\lim_{$1 \\to $2}"],
    [/([xyz])\s*(?:->|→|to|o)\s*([^,\s]+)/g, "$1 \\to $2"],
    
    // Common mathematical symbols
    [/(?<!\\)infinity|(?<!\\)infty/gi, "\\infty"],
    [/(?<!\\)cdot|(?<!\\)·/g, "\\cdot"],
    [/>=(?!\})/g, "\\geq"],
    [/<=(?!\})/g, "\\leq"],
    [/!=|≠/g, "\\neq"],
    [/(?<!\\)pi(?![a-zA-Z])/gi, "\\pi"],
    [/(?<!\\)sum(?![a-zA-Z])/gi, "\\sum"],
    [/(?<!\\)prod(?![a-zA-Z])/gi, "\\prod"],
    
    // Greek letters
    [/(?<!\\)(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|rho|sigma|tau|upsilon|phi|chi|psi|omega)(?![a-zA-Z])/gi, "\\$1"],
    
    // Integrals and calculus
    [/(?<!\\)int(?![a-zA-Z])/gi, "\\int"],
    [/\\int_([a-zA-Z0-9]+)\^([a-zA-Z0-9]+)/g, "\\int_{$1}^{$2}"],
    [/(?<!\\)diff|(?<!\\)partial/gi, "\\partial"],
    [/d([xyz])(?![a-zA-Z])/g, "\\mathrm{d}$1"],
    
    // Powers, subscripts, and superscripts
    [/([a-zA-Z0-9]}])\^([a-zA-Z0-9])(?![}\d])/g, "$1^{$2}"],
    [/([a-zA-Z0-9]}])_([a-zA-Z0-9])(?![}\d])/g, "$1_{$2}"],
    [/\^\{([^}]+)\}/g, "^{$1}"],
    [/_\{([^}]+)\}/g, "_{$1}"],
    
    // Roots and functions
    [/(?<!\\)sqrt\{([^}]+)\}/g, "\\sqrt{$1}"],
    [/(?<!\\)(sin|cos|tan|csc|sec|cot|arcsin|arccos|arctan|log|ln|exp)(?![a-zA-Z])/g, "\\$1"],
    [/\\log_([a-zA-Z0-9])/g, "\\log_{$1}"],
    
    // Matrices and arrays
    [/\[\[\s*([\s\S]*?)\s*\]\]/g, "\\begin{bmatrix}$1\\end{bmatrix}"],
    [/\(\(\s*([\s\S]*?)\s*\)\)/g, "\\begin{pmatrix}$1\\end{pmatrix}"],
    
    // Proper spacing for operators
    [/([0-9a-zA-Z}])\s*([\+\-\*×])\s*([0-9a-zA-Z{])/g, "$1 $2 $3"],
    [/(\d+|\})\s*([=<>])\s*(\d+|\{)/g, "$1 $2 $3"],
    
    // Special functions and notation
    [/(?<!\\)lim(?![a-zA-Z])/g, "\\lim"],
    [/(?<!\\)max(?![a-zA-Z])/g, "\\max"],
    [/(?<!\\)min(?![a-zA-Z])/g, "\\min"],
    [/(?<!\\)sup(?![a-zA-Z])/g, "\\sup"],
    [/(?<!\\)inf(?![a-zA-Z])/g, "\\inf"],
    
    // Set notation
    [/\\?emptyset|∅/g, "\\emptyset"],
    [/\\?in|∈/g, "\\in"],
    [/\\?notin|∉/g, "\\notin"],
    [/\\?subset|⊂/g, "\\subset"],
    [/\\?supset|⊃/g, "\\supset"],
    [/\\?cup|∪/g, "\\cup"],
    [/\\?cap|∩/g, "\\cap"]
  ]

  // Apply all replacements
  replacements.forEach(([pattern, replacement]) => {
    output = output.replace(pattern, replacement)
  })

  // Handle inline math delimiters with minimal spacing
  output = output.replace(/(?<!\\)\$([^$]+)(?<!\\)\$/g, "$ $1 $")
  
  // Handle display math delimiters with single line breaks
  output = output.replace(/(?<!\\)\$\$([^$]+)(?<!\\)\$\$/g, "\n$$\n$1\n$$\n")
  
  // Replace multiple \n\n with single \n
  output = output.replace(/\\n\\n/g, "\n")
  
  // Clean up whitespace while preserving single line breaks
  output = output
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/^\s+|\s+$/g, "")
  
  return output
}


const LoadingDots = () => (
  <div className="flex justify-center gap-1">
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className="w-2 h-2 bg-indigo-600 rounded-full animate-loading-dot"
        style={{
          animationDelay: `${i * 0.15}s`,
        }}
      />
    ))}
  </div>
)

const MessageContent: React.FC<{ content: string }> = ({ content }) => (
  <div className="prose prose-indigo max-w-none latex-content">
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {preprocessLaTeX(content)}
    </ReactMarkdown>
  </div>
)

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content: `Добро пожаловать в Tutor! 👋

Я здесь, чтобы помочь вам с:
• Решением математических задач
• Объяснением концепций
• Построением графиков
• Пошаговыми решениями

Задайте свой вопрос, и давайте начнем!`,
}

export default function App() {
  const [isMobileDevice, setIsMobileDevice] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE])
  const [whiteboardContent, setWhiteboardContent] = useState<string | null>(null)
  const [graphImageUrl, setGraphImageUrl] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [workspaceWidth, setWorkspaceWidth] = useState(60)
  const [isResizing, setIsResizing] = useState(false)
  const [isHoveringDivider, setIsHoveringDivider] = useState(false)
  const dividerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkDevice = () => {
      setIsMobileDevice(window.innerWidth <= 768)
    }
    
    checkDevice()
    window.addEventListener('resize', checkDevice)
    return () => window.removeEventListener('resize', checkDevice)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      
      const containerWidth = window.innerWidth
      const newWidth = (e.clientX / containerWidth) * 100
      const constrainedWidth = Math.min(Math.max(newWidth, 20), 80)
      setWorkspaceWidth(constrainedWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage: Message = { role: "user", content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const updatedMessages: Message[] = [...messages, userMessage]

      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS_ASK}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: input,
          messages: updatedMessages,
        }),
      })

      const data = await response.json()

      if (data.whiteboard && data.whiteboard.length > 0) {
        setGraphImageUrl(null)
        setWhiteboardContent(null)

        for (const widget of data.whiteboard) {
          if (widget.type === "defineGraph") {
            const graphResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS_RENDER_GRAPH}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                content: widget.parameters.content,
              }),
            })
            const graphData = await graphResponse.json()
            if (graphData.status === "success") {
              setGraphImageUrl(graphData.image)
            }
          }
          if (widget.type === "defineWhiteboard") {
            setWhiteboardContent(widget.parameters.content)
          }
        }
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: data.answer,
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error("Error:", error)
      setMessages((prev) => [...prev, { role: "assistant", content: "Ошибка обработки запроса." }])
    } finally {
      setIsLoading(false)
    }
  }

  if (isMobileDevice) {
    return (
      <MobileApp 
        messages={messages}
        setMessages={setMessages}
        whiteboardContent={whiteboardContent}
        setWhiteboardContent={setWhiteboardContent}
        graphImageUrl={graphImageUrl}
        setGraphImageUrl={setGraphImageUrl}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
      />
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Main Workspace */}
      <div
        className="bg-white border-r transition-all duration-300"
        style={{ 
          width: `${workspaceWidth}%`,
          minWidth: workspaceWidth > 20 ? '20%' : '0%',
          maxWidth: '80%'
        }}
      >
        {/* Workspace Header */}
        <div className="h-14 border-b bg-white flex items-center justify-between px-4 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Brain className="h-8 w-8 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-900">Tutor</h1>
          </div>
        </div>

        {/* Workspace Content */}
        <div className="h-[calc(100vh-3.5rem)] overflow-y-auto p-4">
          <div className="space-y-4">
            {whiteboardContent && (
              <div className="prose prose-indigo max-w-none latex-content">
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {preprocessLaTeX(whiteboardContent)}
                </ReactMarkdown>
              </div>
            )}
            {graphImageUrl && (
              <div>
                <h3 className="text-md font-medium mb-2 text-gray-700">График</h3>
                <img
                  src={graphImageUrl}
                  alt="Математический график"
                  className="w-full h-auto rounded-lg border"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resizable Divider */}
      <div 
        ref={dividerRef}
        className={`w-2 cursor-col-resize transition-colors duration-200 ${
          isHoveringDivider ? 'bg-indigo-200' : 'bg-transparent'
        }`}
        onMouseEnter={() => setIsHoveringDivider(true)}
        onMouseLeave={() => setIsHoveringDivider(false)}
        onMouseDown={(e) => {
          setIsResizing(true)
          e.preventDefault()
        }}
      >
        {isHoveringDivider && (
          <div className="w-full h-full bg-indigo-100 opacity-50"></div>
        )}
      </div>

      {/* Chat Section */}
      <div 
        className="bg-white transition-all duration-300"
        style={{ 
          width: `${100 - workspaceWidth}%`,
          minWidth: '20%'
        }}
      >
        <div className="flex flex-col h-full bg-white">
          {/* Chat Header */}
          <div className="h-14 border-b bg-white flex items-center px-4 sticky top-0 z-10">
            <h2 className="text-lg font-semibold text-gray-900">Чат</h2>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`rounded-lg px-4 py-2 max-w-[85%] ${
                    message.role === "user" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <MessageContent content={message.content} />
                </div>
              </div>
            ))}
            {isLoading && <LoadingDots />}
          </div>

          {/* Chat Input */}
          <div className="border-t p-4 bg-white sticky bottom-0">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Задайте свой математический вопрос..."
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}