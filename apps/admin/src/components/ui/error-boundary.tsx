'use client';

import { Component, type ContextType, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { I18nContext } from '@/i18n/context';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Кастомный fallback-компонент вместо стандартного */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — перехватывает ошибки в дереве дочерних компонентов.
 * Должен быть классовым компонентом (React API).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static contextType = I18nContext;
  declare context: ContextType<typeof I18nContext>;

  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium text-destructive">{this.context.t.common.error}</p>
          {this.state.error && (
            <p className="text-xs text-muted-foreground">{this.state.error.message}</p>
          )}
          <Button variant="outline" size="sm" onClick={this.handleRetry}>
            {this.context.t.common.tryAgain}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
