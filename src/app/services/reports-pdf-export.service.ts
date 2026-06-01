import { Injectable } from '@angular/core';
import type jsPDF from 'jspdf';
import type { RowInput } from 'jspdf-autotable';

import { type ReportsFilters, type ReportsViewData } from './reports.service';

export type ReportsPdfExportContext = {
  workspaceName: string;
  activeRole: string;
  scopeLabel: string;
};

@Injectable({ providedIn: 'root' })
export class ReportsPdfExportService {
  async exportReportsPdf(
    viewState: ReportsViewData,
    filters: ReportsFilters,
    activeContext: ReportsPdfExportContext
  ): Promise<void> {
    const { JsPdfCtor, autoTableFn } = await this.loadPdfDependencies();
    const doc = new JsPdfCtor({ format: 'a4', unit: 'pt', orientation: 'portrait' });
    const marginX = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const generatedAt = new Date();
    const generatedLabel = this.formatDateTime(generatedAt.toISOString());
    const dateRangeLabel = this.dateRangeLabel(filters.dateRange);
    const roleLabel = this.roleLabel(activeContext.activeRole || viewState.role);

    let cursorY = 42;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(17, 24, 39);
    doc.text('Wellar AI', marginX, cursorY);

    cursorY += 20;
    doc.setFontSize(14);
    doc.text('Reports Summary', marginX, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    cursorY += 14;
    doc.text('Operational readiness and compliance report', marginX, cursorY);

    cursorY += 18;
    doc.setTextColor(51, 65, 85);
    doc.text(`Workspace: ${activeContext.workspaceName || viewState.workspaceName || 'Current workspace'}`, marginX, cursorY);
    cursorY += 13;
    doc.text(`Active role: ${roleLabel}`, marginX, cursorY);
    cursorY += 13;
    doc.text(`Scope: ${activeContext.scopeLabel || 'Company-wide scope'}`, marginX, cursorY);
    cursorY += 13;
    doc.text(`Date range: ${dateRangeLabel}`, marginX, cursorY);
    cursorY += 13;
    doc.text(`Generated: ${generatedLabel}`, marginX, cursorY);

    cursorY += 18;
    this.drawSectionTitle(doc, marginX, cursorY, 'Section 1: Executive Summary');
    cursorY += 10;
    cursorY = this.drawTable(doc, autoTableFn, {
      marginX,
      startY: cursorY,
      head: [['Metric', 'Value']],
      body: [
        ['Average Compliance Rate', `${viewState.executiveSummary.averageComplianceRate}%`],
        ['Total Completed Scans', String(viewState.executiveSummary.totalCompletedScans)],
        ['Missing Scans', String(viewState.executiveSummary.missingScans)],
        ['Stable Outcomes', String(viewState.executiveSummary.stableOutcomes)],
        ['Attention Outcomes', String(viewState.executiveSummary.attentionOutcomes)],
        ['Open Alerts', String(viewState.executiveSummary.openAlerts)],
        ['Overdue Requests', String(viewState.executiveSummary.overdueRequests)]
      ],
      columnWidths: { 0: 330, 1: 170 }
    });

    cursorY += 16;
    this.drawSectionTitle(doc, marginX, cursorY, 'Section 2: Compliance Trend');
    cursorY += 10;
    cursorY = this.drawTable(doc, autoTableFn, {
      marginX,
      startY: cursorY,
      head: [['Date', 'Active Members', 'Completed', 'Missing', 'Compliance Rate']],
      body: (viewState.complianceTrend ?? []).map((row) => [
        row.dateLabel,
        String(row.activeMembers),
        String(row.completed),
        String(row.missing),
        `${row.complianceRate}%`
      ]),
      emptyMessage: 'No compliance data found for this range.'
    });

    cursorY += 16;
    this.drawSectionTitle(doc, marginX, cursorY, 'Section 3: Missing Scan Details');
    cursorY += 10;
    if (viewState.missingScanDetails.foundCount !== viewState.missingScanDetails.shownCount) {
      const note = `${viewState.missingScanDetails.foundCount} missing scans found, ${viewState.missingScanDetails.shownCount} shown with current filters.`;
      cursorY = this.drawParagraph(doc, marginX, cursorY, note) + 8;
    }
    cursorY = this.drawTable(doc, autoTableFn, {
      marginX,
      startY: cursorY,
      head: [['Date', 'Member', 'Email', 'Department', 'Expected Check', 'Scan Status']],
      body: (viewState.missingScanDetails.rows ?? []).map((row) => [
        row.dateLabel,
        row.memberName || 'Assigned member',
        row.email || '-',
        row.departmentName || 'Unassigned',
        row.expectedCheck,
        row.scanStatus
      ]),
      emptyMessage: 'No missing checks in this range.',
      columnWidths: { 0: 64, 1: 96, 2: 120, 3: 104, 4: 90, 5: 72 }
    });

    cursorY += 16;
    this.drawSectionTitle(doc, marginX, cursorY, 'Section 4: Department Performance');
    cursorY += 10;
    cursorY = this.drawTable(doc, autoTableFn, {
      marginX,
      startY: cursorY,
      head: [['Department', 'Active Members', 'Completed Scans', 'Missing Scans', 'Compliance Rate', 'Attention Outcomes', 'Open Alerts']],
      body: (viewState.departmentPerformance ?? []).map((row) => [
        row.departmentName || 'Unassigned',
        String(row.activeMembers),
        String(row.completedScans),
        String(row.missingScans),
        `${row.complianceRate}%`,
        String(row.attentionOutcomes),
        String(row.openAlerts)
      ]),
      emptyMessage: 'No department performance data found for this range.'
    });

    cursorY += 16;
    this.drawSectionTitle(doc, marginX, cursorY, 'Section 5: Alerts Breakdown');
    cursorY += 10;
    cursorY = this.drawTable(doc, autoTableFn, {
      marginX,
      startY: cursorY,
      head: [['Alert Type', 'Department', 'Severity', 'Status', 'Created', 'Reviewed At', 'Action Type']],
      body: (viewState.alertsBreakdown.rows ?? []).map((row) => [
        row.title || 'Operational alert',
        row.departmentName || 'Unassigned',
        row.severity || '-',
        row.status || '-',
        row.createdLabel || '-',
        row.reviewedAtLabel || '-',
        row.actionTypeLabel || '-'
      ]),
      emptyMessage: 'No operational alerts found in this date range.',
      columnWidths: { 0: 116, 1: 84, 2: 58, 3: 58, 4: 72, 5: 72, 6: 80 }
    });

    cursorY += 16;
    this.drawSectionTitle(doc, marginX, cursorY, 'Section 6: Scan Request Performance');
    cursorY += 10;
    cursorY = this.drawTable(doc, autoTableFn, {
      marginX,
      startY: cursorY,
      head: [['Metric', 'Value']],
      body: [
        ['Total Requests Sent', String(viewState.scanRequestPerformance.totalRequestsSent)],
        ['Completed Requests', String(viewState.scanRequestPerformance.completedRequests)],
        ['Pending Requests', String(viewState.scanRequestPerformance.pendingRequests)],
        ['Overdue Requests', String(viewState.scanRequestPerformance.overdueRequests)],
        ['Cancelled Requests', String(viewState.scanRequestPerformance.cancelledRequests)],
        ['Completion Rate', `${viewState.scanRequestPerformance.completionRate}%`]
      ],
      columnWidths: { 0: 330, 1: 170 }
    });

    if ((viewState.scanRequestPerformance.requestTypeBreakdown ?? []).length) {
      cursorY += 8;
      cursorY = this.drawTable(doc, autoTableFn, {
        marginX,
        startY: cursorY,
        head: [['Request Type', 'Count']],
        body: viewState.scanRequestPerformance.requestTypeBreakdown.map((row) => [
          row.label,
          String(row.count)
        ]),
        columnWidths: { 0: 330, 1: 170 }
      });
    }

    if ((viewState.overdueRequestDetails ?? []).length) {
      cursorY += 16;
      this.drawSectionTitle(doc, marginX, cursorY, 'Section 7: Overdue Request Details');
      cursorY += 10;
      cursorY = this.drawTable(doc, autoTableFn, {
        marginX,
        startY: cursorY,
        head: [['Requested At', 'Due At', 'Target', 'Department', 'Request Type', 'Status']],
        body: (viewState.overdueRequestDetails ?? []).map((row) => [
          row.requestedAtLabel || '-',
          row.dueAtLabel || '-',
          row.targetName || 'Assigned member',
          row.departmentName || 'Unassigned',
          row.requestTypeLabel || '-',
          row.statusLabel || '-'
        ]),
        columnWidths: { 0: 84, 1: 84, 2: 116, 3: 100, 4: 86, 5: 70 }
      });
    }

    cursorY += 16;
    this.drawSectionTitle(doc, marginX, cursorY, 'Section 8: Report Notes');
    cursorY += 10;
    cursorY = this.drawParagraph(
      doc,
      marginX,
      cursorY,
      'This report summarizes operational readiness and compliance activity. It is not a medical or diagnostic report.'
    );

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.6);
      doc.line(marginX, pageHeight - 34, pageWidth - marginX, pageHeight - 34);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('Wellar AI', marginX, pageHeight - 20);
      doc.text(`Page ${page} of ${totalPages}`, pageWidth / 2, pageHeight - 20, { align: 'center' });
      doc.text(`Generated ${generatedLabel}`, pageWidth - marginX, pageHeight - 20, { align: 'right' });
    }

    doc.save(`wellar-reports-summary-${this.todayDateKey(generatedAt)}.pdf`);
  }

  private drawSectionTitle(doc: jsPDF, marginX: number, y: number, title: string): void {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(14, 116, 144);
    doc.text(title, marginX, y);
    doc.setDrawColor(186, 230, 253);
    doc.setLineWidth(0.8);
    doc.line(marginX, y + 6, doc.internal.pageSize.getWidth() - marginX, y + 6);
  }

  private drawParagraph(doc: jsPDF, marginX: number, y: number, text: string): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const contentWidth = doc.internal.pageSize.getWidth() - marginX * 2;
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, marginX, y + 11);
    return y + 11 + (lines.length * 12);
  }

  private drawTable(
    doc: jsPDF,
    autoTableFn: (doc: jsPDF, options: Record<string, unknown>) => void,
    config: {
      marginX: number;
      startY: number;
      head: string[][];
      body: RowInput[];
      emptyMessage?: string;
      columnWidths?: Record<number, number>;
    }
  ): number {
    const bodyRows = config.body.length ? config.body : [[config.emptyMessage || 'No data available']];
    const columnStyles: Record<number, { cellWidth?: number }> = {};
    for (const [key, width] of Object.entries(config.columnWidths ?? {})) {
      const idx = Number(key);
      if (Number.isFinite(idx)) {
        columnStyles[idx] = { cellWidth: width };
      }
    }

    autoTableFn(doc, {
      startY: config.startY,
      head: config.head,
      body: bodyRows,
      margin: { left: config.marginX, right: config.marginX },
      theme: 'striped',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
        cellPadding: 4,
        overflow: 'linebreak',
        valign: 'middle'
      },
      headStyles: {
        fillColor: [15, 118, 110],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles
    });

    const pluginDoc = doc as jsPDF & { lastAutoTable?: { finalY?: number } };
    return (pluginDoc.lastAutoTable?.finalY ?? config.startY) + 4;
  }

  private async loadPdfDependencies(): Promise<{
    JsPdfCtor: new (options?: Record<string, unknown>) => jsPDF;
    autoTableFn: (doc: jsPDF, options: Record<string, unknown>) => void;
  }> {
    try {
      const [{ default: JsPdfCtor }, { default: autoTableFn }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);
      return { JsPdfCtor, autoTableFn };
    } catch {
      throw new Error('PDF_DEPENDENCIES_MISSING');
    }
  }

  private dateRangeLabel(value: ReportsFilters['dateRange']): string {
    if (value === 'today') return 'Today';
    if (value === 'last7') return 'Last 7 days';
    if (value === 'last30') return 'Last 30 days';
    return 'Custom range';
  }

  private roleLabel(value: string): string {
    const normalized = (value || '').trim().toLowerCase();
    if (normalized === 'owner') return 'Owner';
    if (normalized === 'hr') return 'HR';
    if (normalized === 'manager') return 'Manager';
    if (normalized === 'employee') return 'Employee';
    return normalized || 'Role unavailable';
  }

  private formatDateTime(value: string): string {
    const ts = new Date(value).getTime();
    if (!Number.isFinite(ts)) return '-';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(ts));
  }

  private todayDateKey(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
