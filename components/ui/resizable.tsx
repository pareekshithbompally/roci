import * as React from 'react';
import { GripVertical } from 'lucide-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { COMPONENT } from '../../src/config/theme.config';

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof PanelGroup>) {
  return (
    <PanelGroup
      data-slot="resizable-panel-group"
      className={`flex h-full w-full data-[panel-group-direction=vertical]:flex-col ${className || ''}`}
      {...props}
    />
  );
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean;
}) {
  return (
    <PanelResizeHandle
      data-slot="resizable-handle"
      className={`relative flex w-px items-center justify-center ${COMPONENT.resizeHandle} focus-visible:ring-1 focus-visible:ring-zinc-300 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full ${className || ''}`}
      {...props}
    >
      {withHandle && (
        <div className={`z-10 flex h-4 w-3 items-center justify-center rounded-sm ${COMPONENT.resizeHandleKnob}`}>
          <GripVertical className="h-3 w-3 text-zinc-400" />
        </div>
      )}
    </PanelResizeHandle>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
