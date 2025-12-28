import * as commands from "app/client/components/commands";
import { GristDoc } from "app/client/components/GristDoc";
import { makeT } from "app/client/lib/localization";
import { ViewSectionRec } from "app/client/models/DocModel";
import { cssHideForNarrowScreen, mediaSmall, theme, vars } from "app/client/ui2018/cssVars";
import { icon } from "app/client/ui2018/icons";
import { menu, menuItem } from "app/client/ui2018/menus";

import {
  Computed,
  Disposable,
  dom,
  DomContents,
  makeTestId,
  Observable,
  styled,
} from "grainjs";

const t = makeT("AgentMode");
const testId = makeTestId("test-agent-mode-");

interface AgentThought {
  timestamp: number;
  type: "thinking" | "planning" | "executing" | "completed" | "error";
  message: string;
}

interface AgentAction {
  id: string;
  timestamp: number;
  type: "read" | "write" | "query" | "formula" | "permission_denied";
  description: string;
  status: "success" | "error" | "pending";
  duration?: number;
  result?: any;
}

interface ExecutionStep {
  id: string;
  title: string;
  details: string[];
  duration: number;
  status: "running" | "completed" | "error";
}

export class AgentModePage extends Disposable {
  private _thoughts = Observable.create<AgentThought[]>(this, []);
  private _actions = Observable.create<AgentAction[]>(this, []);
  private _executionSteps = Observable.create<ExecutionStep[]>(this, []);
  private _schema = Observable.create(this, "");
  private _memoryContext = Observable.create<string[]>(this, []);
  private _generatedCode = Observable.create(this, "");
  private _isPaused = Observable.create(this, false);
  private _autoScroll = Observable.create(this, true);
  private _selectedAction = Observable.create<AgentAction | null>(this, null);
  private _livePreviewEnabled = Observable.create(this, true);

  constructor(private _gristDoc: GristDoc) {
    super();

    const commandGroup = {
      cancel: () => this._clearAgent(),
    };
    this.autoDispose(commands.createGroup(commandGroup, this, true));

    // Initialize with sample data
    this._initializeSampleData();
  }

  public buildDom(): DomContents {
    return cssAgentContainer(
      // Header
      this._buildHeader(),

      // Main content area with 2-column layout
      cssMainLayout(
        // Left Sidebar: Agent panels
        this._buildLeftSidebar(),

        // Right: Live Document Preview with Chat
        this._buildLivePreviewWithChat(),
      ),
    );
  }

  private _buildHeader(): DomContents {
    return cssHeader(
      cssHeaderLeft(
        cssHeaderIcon(icon("Robot")),
        cssHeaderTitle(t("Agent Mode")),
        cssStatusBadge(
          cssStatusDot(cssStatusDot.cls("-active", use => !use(this._isPaused))),
          dom.text(use => use(this._isPaused) ? t("Paused") : t("Active")),
        ),
      ),
      cssHeaderRight(
        cssHeaderButton(
          icon("Settings"),
          dom.on("click", () => this._showSettings()),
          { title: t("Agent Settings") },
          testId("settings"),
        ),
        cssHeaderButton(
          dom.domComputed(this._isPaused, isPaused =>
            icon(isPaused ? "Play" : "Pause")
          ),
          dom.on("click", () => this._togglePause()),
          { title: t("Pause/Resume Agent") },
          testId("pause"),
        ),
        cssHeaderButton(
          icon("Remove"),
          dom.on("click", () => this._clearAgent()),
          { title: t("Clear Agent Memory") },
          testId("clear"),
        ),
        cssHeaderButton(
          icon("Minimize"),
          dom.on("click", () => this._exitAgentMode()),
          { title: t("Exit Agent Mode") },
          testId("exit"),
        ),
      ),
    );
  }

  private _buildLeftSidebar(): DomContents {
    const activeTab = Observable.create(this, "thinking" as "thinking" | "history" | "permissions");

    return cssSidebar(
      cssSidebarTabs(
        cssSidebarTab(
          cssSidebarTab.cls("-active", use => use(activeTab) === "thinking"),
          icon("Idea"),
          dom("span", t("Thinking")),
          dom.on("click", () => activeTab.set("thinking")),
        ),
        cssSidebarTab(
          cssSidebarTab.cls("-active", use => use(activeTab) === "history"),
          icon("Log"),
          dom("span", t("History")),
          dom.on("click", () => activeTab.set("history")),
        ),
        cssSidebarTab(
          cssSidebarTab.cls("-active", use => use(activeTab) === "permissions"),
          icon("Lock"),
          dom("span", t("Permissions")),
          dom.on("click", () => activeTab.set("permissions")),
        ),
      ),
      cssSidebarContent(
        dom.domComputed(activeTab, tab => {
          if (tab === "thinking") {
            return this._buildThinkingPanel();
          } else if (tab === "history") {
            return this._buildActionHistory();
          } else {
            return this._buildPermissionsPanel();
          }
        }),
      ),
    );
  }

  private _buildThinkingPanel(): DomContents {
    return cssThinkingPanel(
      cssConsoleOutput(
        dom.forEach(this._thoughts, thought => this._buildThoughtItem(thought)),
      ),
    );
  }

  private _buildLivePreviewWithChat(): DomContents {
    return cssMainPanel(
      // Live document preview area
      cssPreviewArea(
        cssPreviewHeader(
          cssPreviewTitle(
            icon("TypeTable"),
            dom("span", t("Document")),
          ),
          cssPreviewBadge(
            cssStatusDot(cssStatusDot.cls("-active")),
            dom("span", t("Live Updates")),
          ),
        ),
        cssPreviewContent(
          // TODO: Embed actual GristDoc view here
          this._buildPreviewPlaceholder(),
        ),
      ),

      // Chat input at bottom
      cssChatInputArea(
        cssChatAvatar(icon("Chat")),
        cssChatTextarea(
          { placeholder: t("Ask the agent to perform actions on your document...") },
          dom.on("keydown", (ev) => {
            if (ev.key === "Enter" && !ev.shiftKey) {
              ev.preventDefault();
              this._sendAgentCommand((ev.target as HTMLTextAreaElement).value);
              (ev.target as HTMLTextAreaElement).value = "";
            }
          }),
        ),
        cssChatSendButton(
          icon("FieldTextbox"),
          dom.on("click", () => {
            const textarea = document.querySelector("textarea");
            if (textarea) {
              this._sendAgentCommand(textarea.value);
              textarea.value = "";
            }
          }),
        ),
      ),
    );
  }

  private _buildPreviewPlaceholder(): DomContents {
    return cssPreviewPlaceholder(
      cssPreviewTable(
        cssPreviewTableHeader(
          cssPreviewCell("ID"),
          cssPreviewCell("Customer"),
          cssPreviewCell("Total"),
          cssPreviewCell("Date"),
        ),
        cssPreviewTableRow(
          cssPreviewTableRow.cls("-highlighted"),
          cssPreviewCell("1"),
          cssPreviewCell("John Doe"),
          cssPreviewCell(
            cssHighlightedValue("$1,234.56"),
            cssChangeIndicator("+"),
          ),
          cssPreviewCell("2024-01-15"),
        ),
        cssPreviewTableRow(
          cssPreviewCell("2"),
          cssPreviewCell("Jane Smith"),
          cssPreviewCell("$987.65"),
          cssPreviewCell("2024-01-16"),
        ),
        cssPreviewTableRow(
          cssPreviewTableRow.cls("-highlighted"),
          cssPreviewCell("3"),
          cssPreviewCell("Bob Wilson"),
          cssPreviewCell(
            cssHighlightedValue("$2,345.00"),
            cssChangeIndicator("+"),
          ),
          cssPreviewCell("2024-01-17"),
        ),
        cssPreviewTableRow(
          cssPreviewCell("..."),
          cssPreviewCell("..."),
          cssPreviewCell("..."),
          cssPreviewCell("..."),
        ),
      ),
      cssPreviewLegend(
        cssLegendItem(
          cssLegendColor(cssLegendColor.cls("-added")),
          dom("span", t("Agent modified")),
        ),
        cssLegendItem(
          cssLegendColor(cssLegendColor.cls("-pending")),
          dom("span", t("Pending change")),
        ),
      ),
    );
  }

  private _buildThoughtItem(thought: AgentThought): DomContents {
    const typeIcons = {
      thinking: "Idea",
      planning: "Settings",
      executing: "Database",
      completed: "Tick",
      error: "Warning",
    };

    return cssThoughtItem(
      cssThoughtItem.cls(`-${thought.type}`),
      cssThoughtIcon(icon(typeIcons[thought.type])),
      cssThoughtContent(
        cssThoughtMessage(thought.message),
        cssThoughtTime(new Date(thought.timestamp).toLocaleTimeString()),
      ),
    );
  }


  private _buildActionHistory(): DomContents {
    return cssActionList(
      dom.forEach(this._actions, action => this._buildActionItem(action)),
      dom.maybe(use => use(this._actions).length === 0, () =>
        cssEmptyState(
          icon("Log"),
          dom("div", t("No actions recorded")),
        )
      ),
    );
  }

  private _buildActionItem(action: AgentAction): DomContents {
    const statusIcons = {
      success: "Tick",
      error: "Warning",
      pending: "Dots",
    };

    return cssActionItem(
      cssActionItem.cls(`-${action.status}`),
      cssActionIcon(icon(statusIcons[action.status])),
      cssActionContent(
        cssActionDescription(action.description),
        cssActionMeta(
          cssActionType(action.type.replace("_", " ")),
          cssActionTime(new Date(action.timestamp).toLocaleTimeString()),
          action.duration && cssActionDuration(`${action.duration}ms`),
        ),
      ),
    );
  }

  private _buildMemoryPanel(): DomContents {
    return cssMemoryPanel(
      dom.forEach(this._memoryContext, (item, index) =>
        cssMemoryItem(
          cssMemoryIndex(`${index + 1}.`),
          cssMemoryText(item),
        )
      ),
      dom.maybe(use => use(this._memoryContext).length === 0, () =>
        cssEmptyState(
          icon("FolderFilled"),
          dom("div", t("Agent memory is empty")),
        )
      ),
    );
  }

  private _buildPermissionsPanel(): DomContents {
    const permissions = [
      { name: "Read table schema", enabled: true },
      { name: "Execute queries", enabled: true },
      { name: "Create formulas", enabled: true },
      { name: "Modify data", enabled: false },
      { name: "Delete records", enabled: false },
      { name: "Access external APIs", enabled: false },
    ];

    return cssPermissionsList(
      dom.forEach(permissions, perm =>
        cssPermissionItem(
          cssPermissionCheckbox(
            { type: "checkbox", checked: perm.enabled },
            dom.on("change", () => this._togglePermission(perm.name)),
          ),
          cssPermissionLabel(
            cssPermissionLabel.cls("-disabled", !perm.enabled),
            perm.name,
          ),
        )
      ),
    );
  }

  private _initializeSampleData() {
    // Sample thoughts
    this._thoughts.set([
      {
        timestamp: Date.now() - 5000,
        type: "thinking",
        message: "Analyzing document structure...",
      },
      {
        timestamp: Date.now() - 4000,
        type: "planning",
        message: "Planning query execution strategy",
      },
      {
        timestamp: Date.now() - 2000,
        type: "executing",
        message: "Executing SUM aggregation on Orders table",
      },
      {
        timestamp: Date.now() - 1000,
        type: "completed",
        message: "Query completed successfully",
      },
    ]);

    // Sample execution steps
    this._executionSteps.set([
      {
        id: "1",
        title: "Schema Analysis",
        details: [
          "Tables: Orders, Products, Customers",
          "Relationships detected: 3",
          "Columns analyzed: 42",
        ],
        duration: 1.2,
        status: "completed",
      },
      {
        id: "2",
        title: "Query Planning",
        details: [
          "Target: SUM(Orders.total)",
          "Filters: date > 2024-01-01",
          "Optimization: Index scan",
        ],
        duration: 0.8,
        status: "completed",
      },
      {
        id: "3",
        title: "Formula Generation",
        details: [
          "Function: AGGREGATE",
          "Parameters validated",
        ],
        duration: 0.3,
        status: "running",
      },
    ]);

    // Sample actions with results
    this._actions.set([
      {
        id: "1",
        timestamp: Date.now() - 10000,
        type: "read",
        description: "Read document schema",
        status: "success",
        duration: 45,
        result: {
          type: "value",
          value: "3 tables, 42 columns",
        },
      },
      {
        id: "2",
        timestamp: Date.now() - 8000,
        type: "query",
        description: "Executed aggregation query: SUM(Orders.total)",
        status: "success",
        duration: 120,
        result: {
          type: "value",
          value: "$45,678.90",
        },
      },
      {
        id: "3",
        timestamp: Date.now() - 5000,
        type: "query",
        description: "Fetched top 5 customers by revenue",
        status: "success",
        duration: 89,
        result: {
          type: "data",
          data: [
            { customer: "Acme Corp", revenue: 15234.50, orders: 23 },
            { customer: "TechStart Inc", revenue: 12456.00, orders: 18 },
            { customer: "Global Traders", revenue: 9876.30, orders: 15 },
            { customer: "Smith & Co", revenue: 8654.20, orders: 12 },
            { customer: "Data Systems", revenue: 7543.10, orders: 10 },
          ],
        },
      },
      {
        id: "4",
        timestamp: Date.now() - 3000,
        type: "permission_denied",
        description: "Attempted to delete records",
        status: "error",
        result: {
          type: "error",
          error: "Permission denied: DELETE operation requires admin access",
        },
      },
    ]);
    
    // Select the query result by default to show something
    this._selectedAction.set(this._actions.get()[2]);

    // Sample schema
    this._schema.set(JSON.stringify({
      tables: [
        {
          name: "Orders",
          columns: ["id", "customer_id", "total", "date"],
          rowCount: 1523,
        },
        {
          name: "Products",
          columns: ["id", "name", "price", "category"],
          rowCount: 89,
        },
      ],
      relationships: [
        { from: "Orders.customer_id", to: "Customers.id" },
      ],
    }, null, 2));

    // Sample generated code
    this._generatedCode.set(
      `# Generated Formula\nSUM(Orders.total)\n\n` +
      `# Filter Condition\nOrders.date > DATE(2024, 1, 1)\n\n` +
      `# Execution Plan\n# 1. Scan Orders table\n# 2. Apply date filter\n# 3. Aggregate totals`
    );

    // Sample memory
    this._memoryContext.set([
      "User asked about total sales for 2024",
      "Identified Orders table contains sales data",
      "Date column format: YYYY-MM-DD",
      "Total column is numeric (currency)",
    ]);
  }

  private _sendAgentCommand(command: string) {
    if (!command.trim()) { return; }

    this._thoughts.get().push({
      timestamp: Date.now(),
      type: "thinking",
      message: `Processing: "${command}"`,
    });
    this._thoughts.set([...this._thoughts.get()]);

    // TODO: Integrate with actual agent backend
    console.log("Agent command:", command);
  }

  private _togglePause() {
    this._isPaused.set(!this._isPaused.get());
  }

  private _clearAgent() {
    this._thoughts.set([]);
    this._actions.set([]);
    this._executionSteps.set([]);
    this._memoryContext.set([]);
  }

  private _showSettings() {
    // TODO: Show settings modal
    console.log("Show agent settings");
  }

  private _exitAgentMode() {
    // TODO: Navigate back to normal view
    this._gristDoc.openDocPage("data");
  }

  private _togglePermission(name: string) {
    // TODO: Toggle permission
    console.log("Toggle permission:", name);
  }
}

// Styled Components

const cssAgentContainer = styled("div", `
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: ${theme.mainPanelBg};
  overflow: hidden;
`);

const cssHeader = styled("div", `
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: linear-gradient(135deg, ${theme.controlPrimaryBg} 0%, ${theme.accentIcon} 100%);
  color: white;
  border-bottom: 1px solid ${theme.pagePanelsBorder};
  flex-shrink: 0;
`);

const cssHeaderLeft = styled("div", `
  display: flex;
  align-items: center;
  gap: 12px;
`);

const cssHeaderIcon = styled("div", `
  font-size: 24px;
`);

const cssHeaderTitle = styled("div", `
  font-size: 18px;
  font-weight: 600;
`);

const cssStatusBadge = styled("div", `
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  font-size: 13px;
`);

const cssStatusDot = styled("div", `
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${theme.lightText};

  &-active {
    background: #4ade80;
    box-shadow: 0 0 8px #4ade80;
  }
`);

const cssHeaderRight = styled("div", `
  display: flex;
  gap: 8px;
`);

const cssHeaderButton = styled("div", `
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`);

const cssMainLayout = styled("div", `
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 1px;
  flex: 1;
  background: ${theme.pagePanelsBorder};
  overflow: hidden;
`);

const cssSidebar = styled("div", `
  display: flex;
  flex-direction: column;
  background: ${theme.leftPanelBg};
  overflow: hidden;
`);

const cssSidebarTabs = styled("div", `
  display: flex;
  border-bottom: 1px solid ${theme.pagePanelsBorder};
  background: ${theme.leftPanelBg};
`);

const cssSidebarTab = styled("div", `
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 8px;
  font-size: 13px;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  transition: all 0.2s;
  
  &:hover {
    background: ${theme.hover};
  }
  
  &-active {
    border-bottom-color: ${theme.accentBorder};
    background: ${theme.hover};
    font-weight: 600;
  }
`);

const cssSidebarContent = styled("div", `
  flex: 1;
  overflow: auto;
  padding: 16px;
`);

const cssMainPanel = styled("div", `
  display: flex;
  flex-direction: column;
  background: ${theme.mainPanelBg};
  overflow: hidden;
`);

const cssPreviewArea = styled("div", `
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`);

const cssPreviewHeader = styled("div", `
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: ${theme.leftPanelBg};
  border-bottom: 1px solid ${theme.pagePanelsBorder};
`);

const cssPreviewTitle = styled("div", `
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
`);

const cssPreviewBadge = styled("div", `
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: ${theme.hover};
  border-radius: 12px;
  font-size: 12px;
`);

const cssPreviewContent = styled("div", `
  flex: 1;
  overflow: auto;
  padding: 20px;
`);

const cssConsoleOutput = styled("div", `
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
`);

const cssThoughtItem = styled("div", `
  display: flex;
  gap: 12px;
  padding: 12px;
  background: ${theme.hover};
  border-radius: 8px;
  border-left: 3px solid ${theme.accentBorder};

  &-thinking {
    border-left-color: #3b82f6;
  }

  &-planning {
    border-left-color: #8b5cf6;
  }

  &-executing {
    border-left-color: #f59e0b;
  }

  &-completed {
    border-left-color: #10b981;
  }

  &-error {
    border-left-color: #ef4444;
  }
`);

const cssThoughtIcon = styled("div", `
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
`);

const cssThoughtContent = styled("div", `
  flex: 1;
  min-width: 0;
`);

const cssThoughtMessage = styled("div", `
  font-size: 14px;
  color: ${theme.text};
  margin-bottom: 4px;
`);

const cssThoughtTime = styled("div", `
  font-size: 12px;
  color: ${theme.lightText};
`);

const cssThinkingPanel = styled("div", `
  display: flex;
  flex-direction: column;
  gap: 12px;
`);

const cssChatInputArea = styled("div", `
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 16px 20px;
  background: ${theme.leftPanelBg};
  border-top: 1px solid ${theme.pagePanelsBorder};
`);

const cssChatAvatar = styled("div", `
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
`);

const cssChatTextarea = styled("textarea", `
  flex: 1;
  border: 1px solid ${theme.inputBorder};
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
  font-family: ${vars.fontFamily};
  resize: none;
  min-height: 44px;
  max-height: 120px;
  background: ${theme.inputBg};
  color: ${theme.inputFg};
  
  &:focus {
    outline: none;
    border-color: ${theme.accentBorder};
    box-shadow: 0 0 0 1px ${theme.accentBorder};
  }
  
  &::placeholder {
    color: ${theme.inputPlaceholderFg};
  }
`);

const cssChatSendButton = styled("div", `
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  background: ${theme.controlPrimaryBg};
  color: white;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.2s;
  
  &:hover {
    opacity: 0.9;
  }
  
  &:active {
    opacity: 0.8;
  }
`);




const cssActionList = styled("div", `
  display: flex;
  flex-direction: column;
  gap: 8px;
`);

const cssActionItem = styled("div", `
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  background: ${theme.hover};
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: ${theme.lightHover};
  }

  &-success {
    border-left: 3px solid #10b981;
  }

  &-error {
    border-left: 3px solid #ef4444;
  }

  &-pending {
    border-left: 3px solid #f59e0b;
  }
`);

const cssActionIcon = styled("div", `
  flex-shrink: 0;
  width: 20px;
  height: 20px;
`);

const cssActionContent = styled("div", `
  flex: 1;
  min-width: 0;
`);

const cssActionDescription = styled("div", `
  font-size: 13px;
  color: ${theme.text};
  margin-bottom: 4px;
`);

const cssActionMeta = styled("div", `
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: ${theme.lightText};
`);

const cssActionType = styled("span", `
  text-transform: uppercase;
  font-weight: 600;
`);

const cssActionTime = styled("span", ``);

const cssActionDuration = styled("span", ``);


const cssPreviewPlaceholder = styled("div", `
  padding: 16px;
  height: 100%;
  overflow: auto;
`);

const cssPreviewTable = styled("div", `
  border: 1px solid ${theme.pagePanelsBorder};
  border-radius: 8px;
  overflow: hidden;
  background: white;
`);

const cssPreviewTableHeader = styled("div", `
  display: grid;
  grid-template-columns: 60px 1fr 120px 100px;
  background: #f8f9fa;
  border-bottom: 2px solid ${theme.pagePanelsBorder};
  font-weight: 600;
`);

const cssPreviewTableRow = styled("div", `
  display: grid;
  grid-template-columns: 60px 1fr 120px 100px;
  border-bottom: 1px solid ${theme.pagePanelsBorder};
  
  &-highlighted {
    background: #fef3c7;
    animation: highlight-pulse 2s ease-in-out infinite;
  }
  
  @keyframes highlight-pulse {
    0%, 100% {
      background: #fef3c7;
    }
    50% {
      background: #fde68a;
    }
  }
`);

const cssPreviewCell = styled("div", `
  padding: 10px 12px;
  border-right: 1px solid ${theme.pagePanelsBorder};
  font-size: 13px;
  position: relative;
  
  &:last-child {
    border-right: none;
  }
`);

const cssHighlightedValue = styled("span", `
  font-weight: 600;
  color: #f59e0b;
`);

const cssChangeIndicator = styled("span", `
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  background: #10b981;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
`);

const cssPreviewLegend = styled("div", `
  display: flex;
  gap: 20px;
  margin-top: 16px;
  padding: 12px;
  background: ${theme.hover};
  border-radius: 6px;
`);

const cssLegendItem = styled("div", `
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
`);

const cssLegendColor = styled("div", `
  width: 16px;
  height: 16px;
  border-radius: 3px;
  
  &-added {
    background: #fef3c7;
    border: 1px solid #f59e0b;
  }
  
  &-pending {
    background: #dbeafe;
    border: 1px solid #3b82f6;
  }
`);


const cssMemoryPanel = styled("div", `
  display: flex;
  flex-direction: column;
  gap: 12px;
`);

const cssMemoryItem = styled("div", `
  display: flex;
  gap: 12px;
  padding: 12px;
  background: ${theme.hover};
  border-radius: 6px;
`);

const cssMemoryIndex = styled("div", `
  flex-shrink: 0;
  font-weight: 600;
  color: ${theme.accentIcon};
`);

const cssMemoryText = styled("div", `
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
`);

const cssPermissionsList = styled("div", `
  display: flex;
  flex-direction: column;
  gap: 12px;
`);

const cssPermissionItem = styled("div", `
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: ${theme.hover};
  border-radius: 6px;
`);

const cssPermissionCheckbox = styled("input", `
  cursor: pointer;
`);

const cssPermissionLabel = styled("label", `
  flex: 1;
  font-size: 14px;
  cursor: pointer;

  &-disabled {
    color: ${theme.lightText};
  }
`);

const cssEmptyState = styled("div", `
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 20px;
  color: ${theme.lightText};
  text-align: center;
`);

