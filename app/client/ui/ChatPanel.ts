import { GristDoc } from "app/client/components/GristDoc";
import { makeT } from "app/client/lib/localization";
import { ChatMessage } from "app/client/models/ChatHistory";
import { renderCellMarkdown } from "app/client/ui/MarkdownCellRenderer";
import { theme } from "app/client/ui2018/cssVars";
import { icon } from "app/client/ui2018/icons";

import {
  Disposable,
  dom,
  DomContents,
  Observable,
  styled,
} from "grainjs";

const t = makeT("ChatPanel");

/**
 * ChatPanel provides a clean, Cursor-style AI chat interface for Grist.
 * It displays on the right side of the document and allows users to interact
 * with AI assistance in a conversational manner.
 */
export class ChatPanel extends Disposable {
  private _messages = Observable.create<ChatMessage[]>(this, []);
  private _inputText = Observable.create(this, "");
  private _thinking = Observable.create(this, false);
  private _messagesEndRef: HTMLElement | null = null;

  constructor(private _gristDoc: GristDoc) {
    super();
    void this._gristDoc; // TODO: Use _gristDoc for AI backend integration

    // Initialize with a welcome message
    this._messages.set([{
      sender: "ai",
      message: "Hi! I'm your AI assistant. I can help you with formulas, data analysis, " +
        "and understanding your spreadsheet. What would you like to know?",
    }]);
  }

  public buildDom(): DomContents {
    return cssChatContainer(
      // Header
      this._buildHeader(),

      // Messages area
      this._buildMessagesArea(),

      // Input area
      this._buildInputArea(),
    );
  }

  private _buildHeader(): DomContents {
    return cssChatHeader(
      cssHeaderTitle(
        icon("Chat"),
        dom("span", t("AI Assistant")),
      ),
      cssHeaderActions(
        cssIconButton(
          icon("Dots"),
          dom.on("click", () => this._showChatMenu()),
          { title: t("Chat options") },
        ),
      ),
    );
  }

  private _buildMessagesArea(): DomContents {
    return cssChatMessages(
      dom.forEach(this._messages, msg => this._buildMessage(msg)),
      dom.maybe(this._thinking, () => this._buildThinkingIndicator()),
      // Invisible element to scroll to
      dom("div", elem => this._messagesEndRef = elem),
    );
  }

  private _buildMessage(msg: ChatMessage): DomContents {
    const isUser = msg.sender === "user";

    return cssMessage(
      cssMessage.cls("-user", isUser),
      cssMessage.cls("-ai", !isUser),

      cssMessageBubble(
        cssMessageBubble.cls("-user", isUser),
        cssMessageBubble.cls("-ai", !isUser),

        // Avatar/Icon
        cssMessageIcon(
          isUser ?
            cssUserIconEl(icon("FieldColumn")) :
            cssAiIconEl(icon("Chat")),
        ),

        // Message content
        cssMessageContent(
          isUser ?
            cssMessageText(msg.message) :
            cssAiMessageContent(
              // Render markdown for AI responses
              renderCellMarkdown(msg.message),

              // Show suggested actions if any
              msg.formula ? cssFormulaPreview(
                cssFormulaLabel(t("Suggested Formula:")),
                cssFormulaCode(msg.formula),
                cssActionButtons(
                  cssApplyButton(
                    t("Apply Formula"),
                    dom.on("click", () => this._applyFormula(msg)),
                  ),
                  cssPreviewButton(
                    t("Preview"),
                    dom.on("click", () => this._previewFormula(msg)),
                  ),
                ),
              ) : null,

              // Show error if any
              msg.error ? cssErrorMessage(
                icon("Warning"),
                dom("span", msg.error.message || "An error occurred"),
              ) : null,
            ),
        ),
      ),
    );
  }

  private _buildThinkingIndicator(): DomContents {
    return cssThinkingIndicator(
      cssThinkingDots(
        cssThinkingDot(),
        cssThinkingDot(),
        cssThinkingDot(),
      ),
      dom("span", t("Thinking...")),
    );
  }

  private _buildInputArea(): DomContents {
    return cssChatInputContainer(
      cssChatInputWrapper(
        cssChatInput(
          dom.prop("value", this._inputText),
          dom.on("input", (e, elem: HTMLTextAreaElement) => {
            this._inputText.set(elem.value);
            this._autoResizeTextarea(elem);
          }),
          dom.onKeyDown({
            Enter: (ev) => {
              if (!ev.shiftKey && !ev.metaKey && !ev.ctrlKey) {
                ev.preventDefault();
                this._sendMessage().catch(console.error);
              }
            },
          }),
          dom.attr("placeholder", t("Ask me anything... (Shift+Enter for new line)")),
          dom.attr("rows", "1"),
        ),
        cssSendButton(
          icon("FieldTextbox"),
          dom.on("click", () => this._sendMessage().catch(console.error)),
          dom.cls("disabled", use => !use(this._inputText).trim() || use(this._thinking)),
          { title: t("Send message") },
        ),
      ),
      cssInputHint(
        t("Pro tip: Ask about formulas, data analysis, or how to structure your tables"),
      ),
    );
  }

  private _autoResizeTextarea(elem: HTMLTextAreaElement) {
    elem.style.height = "auto";
    const maxHeight = 200; // Max 200px height
    elem.style.height = Math.min(elem.scrollHeight, maxHeight) + "px";
  }

  private async _sendMessage() {
    const message = this._inputText.get().trim();
    if (!message || this._thinking.get()) {
      return;
    }

    // Add user message to chat
    this._messages.get().push({
      sender: "user",
      message,
    });
    this._messages.set([...this._messages.get()]);

    // Clear input
    this._inputText.set("");

    // Reset textarea height
    const textarea = document.querySelector("textarea");
    if (textarea) {
      textarea.style.height = "auto";
    }

    // Show thinking indicator
    this._thinking.set(true);

    // Scroll to bottom
    this._scrollToBottom();

    // TODO: Integrate with backend AI service
    // For now, just show a placeholder response
    setTimeout(() => {
      this._messages.get().push({
        sender: "ai",
        message: "I'm ready to help! The AI backend integration is coming soon. " +
          "In the meantime, I can show you what the interface will look like.",
      });
      this._messages.set([...this._messages.get()]);
      this._thinking.set(false);
      this._scrollToBottom();
    }, 1500);
  }

  private _scrollToBottom() {
    setTimeout(() => {
      if (this._messagesEndRef) {
        this._messagesEndRef.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    }, 100);
  }

  private _applyFormula(msg: ChatMessage) {
    // TODO: Apply the formula to the current column
    console.log("Apply formula:", msg.formula);
  }

  private _previewFormula(msg: ChatMessage) {
    // TODO: Preview the formula effects
    console.log("Preview formula:", msg.formula);
  }

  private _showChatMenu() {
    // TODO: Show menu with options like "Clear chat", "Export conversation", etc.
    console.log("Show chat menu");
  }
}

// Styled components

const cssChatContainer = styled("div", `
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: ${theme.mainPanelBg};
  position: relative;
  z-index: 10;
`);

const cssChatHeader = styled("div", `
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${theme.pagePanelsBorder};
  background-color: ${theme.rightPanelBg};
  flex-shrink: 0;
`);

const cssHeaderTitle = styled("div", `
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: ${theme.text};
`);

const cssHeaderActions = styled("div", `
  display: flex;
  gap: 4px;
`);

const cssIconButton = styled("div", `
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${theme.hover};
  }
`);

const cssChatMessages = styled("div", `
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scroll-behavior: smooth;
`);

const cssMessage = styled("div", `
  display: flex;
  flex-direction: column;

  &-user {
    align-items: flex-end;
  }

  &-ai {
    align-items: flex-start;
  }
`);

const cssMessageBubble = styled("div", `
  display: flex;
  gap: 8px;
  max-width: 85%;

  &-user {
    flex-direction: row-reverse;
  }

  &-ai {
    flex-direction: row;
  }
`);

const cssMessageIcon = styled("div", `
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-top: 4px;
`);

const cssUserIconEl = styled("div", `
  width: 28px;
  height: 28px;
  background-color: ${theme.controlPrimaryBg};
  color: white;
  border-radius: 50%;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
`);

const cssAiIconEl = styled("div", `
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 50%;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
`);

const cssMessageContent = styled("div", `
  flex: 1;
  min-width: 0;
`);

const cssMessageText = styled("div", `
  background-color: ${theme.controlPrimaryBg};
  color: white;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
  word-wrap: break-word;
`);

const cssAiMessageContent = styled("div", `
  background-color: ${theme.hover};
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  color: ${theme.text};

  & code {
    background-color: ${theme.lightHover};
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 13px;
  }

  & strong {
    font-weight: 600;
  }
`);

const cssFormulaPreview = styled("div", `
  margin-top: 12px;
  border-top: 1px solid ${theme.pagePanelsBorder};
  padding-top: 12px;
`);

const cssFormulaLabel = styled("div", `
  font-size: 12px;
  font-weight: 600;
  color: ${theme.lightText};
  margin-bottom: 6px;
`);

const cssFormulaCode = styled("div", `
  background-color: ${theme.lightHover};
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: ${theme.text};
  margin-bottom: 10px;
  overflow-x: auto;
`);

const cssActionButtons = styled("div", `
  display: flex;
  gap: 8px;
`);

const cssApplyButton = styled("button", `
  padding: 6px 12px;
  background-color: ${theme.controlPrimaryBg};
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.9;
  }

  &:active {
    opacity: 0.8;
  }
`);

const cssPreviewButton = styled("button", `
  padding: 6px 12px;
  background-color: transparent;
  color: ${theme.text};
  border: 1px solid ${theme.pagePanelsBorder};
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${theme.hover};
  }
`);

const cssErrorMessage = styled("div", `
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 10px;
  background-color: ${theme.toastErrorBg};
  border-left: 3px solid ${theme.toastErrorBg};
  border-radius: 4px;
  font-size: 13px;
  color: ${theme.errorText};
`);

const cssThinkingIndicator = styled("div", `
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background-color: ${theme.hover};
  border-radius: 12px;
  max-width: 85%;
  font-size: 14px;
  color: ${theme.lightText};
`);

const cssThinkingDots = styled("div", `
  display: flex;
  gap: 4px;
`);

const cssThinkingDot = styled("div", `
  width: 6px;
  height: 6px;
  background-color: ${theme.lightText};
  border-radius: 50%;
  animation: thinking 1.4s ease-in-out infinite;

  &:nth-child(1) {
    animation-delay: 0s;
  }

  &:nth-child(2) {
    animation-delay: 0.2s;
  }

  &:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes thinking {
    0%, 60%, 100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    30% {
      opacity: 1;
      transform: scale(1.2);
    }
  }
`);

const cssChatInputContainer = styled("div", `
  flex-shrink: 0;
  border-top: 1px solid ${theme.pagePanelsBorder};
  background-color: ${theme.rightPanelBg};
  padding: 12px 16px;
`);

const cssChatInputWrapper = styled("div", `
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background-color: ${theme.inputBg};
  border: 1px solid ${theme.inputBorder};
  border-radius: 8px;
  padding: 8px 12px;
  transition: border-color 0.2s;

  &:focus-within {
    border-color: ${theme.accentBorder};
    box-shadow: 0 0 0 1px ${theme.accentBorder};
  }
`);

const cssChatInput = styled("textarea", `
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: ${theme.inputFg};
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  min-height: 24px;
  max-height: 200px;

  &::placeholder {
    color: ${theme.inputPlaceholderFg};
  }
`);

const cssSendButton = styled("div", `
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${theme.controlPrimaryBg};
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover:not(.disabled) {
    opacity: 0.9;
  }

  &:active:not(.disabled) {
    opacity: 0.8;
  }

  &.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`);

const cssInputHint = styled("div", `
  margin-top: 8px;
  font-size: 12px;
  color: ${theme.lightText};
  text-align: center;
`);
