/*
  The main window instance.  This manages all of the docking panels and user input.
  There should only be one instance of this, although it is not required.
  The $parent is a JQuery object of the container element.
*/
function wcDocker(container) {
  this.$container = $(container).addClass('wcDocker');

  this._root = null;
  this._center = null;
  this._floatingList = [];

  this._frameList = [];
  this._splitterList = [];

  this._dockWidgetTypeList = [];

  this._draggingSplitter = false;
  this._draggingFrame = false;
  this._draggingFrameSizer = false;
  this._ghost = false;

  this._init();
};

wcDocker.DOCK_FLOAT  = 'float';
wcDocker.DOCK_TOP    = 'top';
wcDocker.DOCK_LEFT   = 'left';
wcDocker.DOCK_RIGHT  = 'right';
wcDocker.DOCK_BOTTOM = 'bottom';

wcDocker.prototype = {
  _init: function() {
    var widget = new wcPanel('');
    widget.closeable(false);
    widget.layout().$table.addClass('wcCenter');
    widget.size(this.$container.width()/2, this.$container.height()/2);
    this._center = new wcFrame(this.$container, widget, false, true);
    this._center.addPanel(widget);
    this._root = this._center;

    var self = this;

    // Setup our context menus.
    $.contextMenu({
      selector: '.wcFrame, .wcLayout',
      build: function($trigger, event) {
        var mouse = {
          x: event.clientX,
          y: event.clientY,
        };
        
        var ghost;
        var myFrame;
        for (var i = 0; i < self._frameList.length; ++i) {
          if (self._frameList[i].$frame[0] === $trigger[0] ||
              self._frameList[i].panel().layout().$table[0] === $trigger[0]) {
            myFrame = self._frameList[i];
            break;
          }
        }
        if (!myFrame) {
          if (self._center.$frame[0] === $trigger[0] ||
              self._center.panel().layout().$table[0] === $trigger[0]) {
            myFrame = self._center;
          }
        }

        var items = {};
        if (myFrame) {
          var spacer = false;
          if (myFrame.panel().closeable()) {
            items['Close Window'] = {name: 'Close Window'};
            spacer = true;
          }
          if (!myFrame._isFloating && myFrame.panel().moveable()) {
            items['Float Window'] = {name: 'Detach Window'};
            spacer = true;
          }

          if (spacer && !myFrame._isFloating) {
            items['sep1'] = "---------";
          }
        }

        if (!myFrame._isFloating && myFrame.panel().moveable()) {
          var windowTypes = {};
          for (var i = 0; i < self._dockWidgetTypeList.length; ++i) {
            var type = self._dockWidgetTypeList[i];
            if (!type.isPrivate) {
              windowTypes[type.name] = {name: type.name};
            }
          }

          items.fold1 = {
            name: 'Create Window',
            items: windowTypes,
          };
          items['sep2'] = "---------";

          var rect = myFrame.rect();
          ghost = new wcGhost(rect, mouse);
          myFrame.checkAnchorDrop(mouse, false, ghost);
        }

        items['Flash Window'] = {name: 'Flash Window'};

        return {
          callback: function(key, options) {
            if (key === 'Close Window') {
              myFrame.panel().close();
            } else if (key === 'Float Window') {
              self.movePanel(myFrame.panel(), wcDocker.DOCK_FLOAT, false);
            } else if (key === 'Flash Window') {
              myFrame.focus(true);
            } else {
              if (myFrame && ghost) {
                var anchor = ghost.anchor();
                self.addPanel(key, anchor.loc, false, myFrame.panel());
              }
            }
          },
          events: {
            hide: function(opt) {
              if (ghost) {
                ghost.destroy();
                ghost = null;
              }
            },
          },
          animation: {duration: 250, show: 'fadeIn', hide: 'fadeOut'},
          reposition: false,
          // autoHide: true,
          zIndex: 200,
          items: items,
        };
      },
    })


    $(window).resize(self._resize.bind(self));

    // Close button on frames should destroy those widgets.
    $('body').on('click', '.wcFrameCloseButton', function() {
      var frame;
      for (var i = 0; i < self._frameList.length; ++i) {
        if (self._frameList[i].$close[0] == this) {
          frame = self._frameList[i];
          break;
        }
      }
      if (frame) {
        self.removePanel(frame.panel());
        self._focus(frame);
      }
    });

    // Dock button on floating frames should allow them to dock.
    $('body').on('click', '.wcFrameDockButton', function() {
      for (var i = 0; i < self._frameList.length; ++i) {
        if (self._frameList[i]._isFloating && self._frameList[i].$dock[0] == this) {
          self._frameList[i].$dock.toggleClass('wcFrameDockButtonLocked');

          self._focus(self._frameList[i]);
          break;
        }
      }
    });

    // Mouse down on a splitter bar will allow you to resize them.
    $('body').on('mousedown', '.wcSplitterBar', function(event) {
      if (event.which === 3) {
        return;
      }
      for (var i = 0; i < self._splitterList.length; ++i) {
        if (self._splitterList[i].$bar[0] === this) {
          self._draggingSplitter = self._splitterList[i];
          break;
        }
      }
    });

    // Mouse down on a frame title will allow you to move them.
    $('body').on('mousedown', '.wcFrameTitle', function(event) {
      if (event.which === 3) {
        return;
      }
      for (var i = 0; i < self._frameList.length; ++i) {
        if (self._frameList[i].$title[0] == this) {
          self._draggingFrame = self._frameList[i];

          var mouse = {
            x: event.clientX,
            y: event.clientY,
          };
          self._draggingFrame.anchorMove(mouse);

          // If the window is able to be docked, give it a dark shadow tint and
          // begin the movement process
          if (!self._draggingFrame._isFloating || (event.which !== 1 || self._draggingFrame.$dock.hasClass('wcFrameDockButtonLocked'))) {
            self._draggingFrame.shadow(true);
            var rect = self._draggingFrame.rect();
            self._ghost = new wcGhost(rect, mouse);
            self._draggingFrame.checkAnchorDrop(mouse, true, self._ghost);

            // Also fade out all floating windows as they are not dockable.
            for (var a = 0; a < self._frameList.length; ++a) {
              if (self._frameList[a]._isFloating) {
                self._frameList[a].shadow(true);
              }
            }
          }
          break;
        }
      }
      if (self._draggingFrame) {
        self._focus(self._draggingFrame);
      }
    });

    // Mouse down on a frame title will allow you to move them.
    $('body').on('mousedown', '.wcFrameCenter', function(event) {
      if (event.which === 3) {
        return;
      }
      for (var i = 0; i < self._frameList.length; ++i) {
        if (self._frameList[i].$center[0] == this) {
          self._focus(self._frameList[i]);
          break;
        }
      }
    });

    // Floating frames have resizable edges.
    $('body').on('mousedown', '.wcFrameEdge', function(event) {
      if (event.which === 3) {
        return;
      }
      for (var i = 0; i < self._frameList.length; ++i) {
        if (self._frameList[i]._isFloating) {
          if (self._frameList[i].$top[0] == this) {
            self._draggingFrame = self._frameList[i];
            self._draggingFrameSizer = ['top'];
            break;
          } else if (self._frameList[i].$bottom[0] == this) {
            self._draggingFrame = self._frameList[i];
            self._draggingFrameSizer = ['bottom'];
            break;
          } else if (self._frameList[i].$left[0] == this) {
            self._draggingFrame = self._frameList[i];
            self._draggingFrameSizer = ['left'];
            break;
          } else if (self._frameList[i].$right[0] == this) {
            self._draggingFrame = self._frameList[i];
            self._draggingFrameSizer = ['right'];
            break;
          } else if (self._frameList[i].$corner1[0] == this) {
            self._draggingFrame = self._frameList[i];
            self._draggingFrameSizer = ['top', 'left'];
            break;
          } else if (self._frameList[i].$corner2[0] == this) {
            self._draggingFrame = self._frameList[i];
            self._draggingFrameSizer = ['top', 'right'];
            break;
          } else if (self._frameList[i].$corner3[0] == this) {
            self._draggingFrame = self._frameList[i];
            self._draggingFrameSizer = ['bottom', 'right'];
            break;
          } else if (self._frameList[i].$corner4[0] == this) {
            self._draggingFrame = self._frameList[i];
            self._draggingFrameSizer = ['bottom', 'left'];
            break;
          }
        }
      }
      if (self._draggingFrame) {
        self._focus(self._draggingFrame);
      }
    });

    // Mouse move will allow you to move an object that is being dragged.
    $('body').on('mousemove', function(event) {
      if (event.which === 3) {
        return;
      }
      if (self._draggingSplitter) {
        var mouse = {
          x: event.clientX,
          y: event.clientY,
        };
        self._draggingSplitter.moveBar(mouse);
        self._draggingSplitter._update();
      } else if (self._draggingFrameSizer) {
        var mouse = {
          x: event.clientX,
          y: event.clientY,
        };

        var offset = self.$container.offset();
        mouse.x += offset.left;
        mouse.y += offset.top;

        self._draggingFrame.resize(self._draggingFrameSizer, mouse);
        self._draggingFrame._update();
      } else if (self._draggingFrame) {
        var mouse = {
          x: event.clientX,
          y: event.clientY,
        };

        // Floating widgets without their dock button active just move without docking.
        if (self._draggingFrame._isFloating && (event.which === 1 && !self._draggingFrame.$dock.hasClass('wcFrameDockButtonLocked'))) {
          self._draggingFrame.move(mouse);
          self._draggingFrame._update();
        }

        if (self._ghost) {
          self._ghost.move(mouse);

          var forceFloat = !(self._draggingFrame._isFloating || event.which === 1);
          var found = false;

          // Check anchoring with self.
          if (!self._draggingFrame.checkAnchorDrop(mouse, true, self._ghost)) {
            if (!forceFloat) {
              for (var i = 0; i < self._frameList.length; ++i) {
                if (self._frameList[i].checkAnchorDrop(mouse, false, self._ghost)) {
                  return;
                }
              }

              if (self._center.checkAnchorDrop(mouse, false, self._ghost)) {
                return;
              }
            }

            self._ghost.anchor(mouse, null);
          }
        }
      }
    });

    // Mouse released
    $('body').on('mouseup', function(event) {
      if (event.which === 3) {
        return;
      }
      if (self._draggingFrame) {
        for (var i = 0; i < self._frameList.length; ++i) {
          self._frameList[i].shadow(false);
        }
      }

      if (self._ghost) {
        var anchor = self._ghost.anchor();

        if (!anchor) {
          var widget = self.movePanel(self._draggingFrame.panel(), wcDocker.DOCK_FLOAT, false);
          var mouse = {
            x: event.clientX,
            y: event.clientY,
          };
          var frame = widget.parent();
          if (frame instanceof wcFrame) {
            frame.pos(mouse.x, mouse.y + self._ghost.rect().h/2, true);
          }

          // frame._pos.x -= self._ghost.rect().x
          // frame._pos.y -= self._ghost.rect().y
          frame._size.x = self._ghost.rect().w;
          frame._size.y = self._ghost.rect().h;

          frame._update();
        } else if (!anchor.self) {
          var widget;
          if (anchor.item) {
            widget = anchor.item.parent();
          }
          self.movePanel(self._draggingFrame.panel(), anchor.loc, false, widget);
        }
        self._ghost.destroy();
      }

      self._ghost = false;
      self._draggingSplitter = false;
      self._draggingFrame = false;
      self._draggingFrameSizer = false;
    });
  },

  // On window resized event.
  _resize: function(event) {
    this._update();
  },

  // Brings a floating window to the top.
  _focus: function(frame) {
    for (var i = 0; i < this._frameList.length; ++i) {
      if (this._frameList[i]._isFloating) {
        this._frameList[i].$frame.css('z-index', '100');
        if (this._frameList[i] === frame) {
          this._frameList[i].$frame.css('z-index', '101');
        }
      }
    }
    this._update();
  },

  // Creates a new frame for the widget and then attaches it
  // to the window.
  // Params:
  //    widget        The widget to insert.
  //    location      The desired location for the widget.
  //    parentWidget  An optional widget to 'split', if not supplied the
  //                  new widget will split the center window.
  _addPanelAlone: function(widget, location, parentWidget) {
    // Floating windows need no placement.
    if (location === wcDocker.DOCK_FLOAT) {
      var frame = new wcFrame(this.$container, this, true);
      this._frameList.push(frame);
      this._floatingList.push(frame);
      frame.addPanel(widget);
      return;
    }

    if (parentWidget) {
      var parentFrame = parentWidget.parent();
      if (parentFrame instanceof wcFrame) {
        var parentSplitter = parentFrame.parent();
        if (parentSplitter instanceof wcSplitter) {
          var splitter;
          var left  = parentSplitter.pane(0);
          var right = parentSplitter.pane(1);
          if (left === parentFrame) {
            splitter = new wcSplitter(null, parentSplitter, location !== wcDocker.DOCK_BOTTOM && location !== wcDocker.DOCK_TOP);
            parentSplitter.pane(0, splitter);
          } else {
            splitter = new wcSplitter(null, parentSplitter, location !== wcDocker.DOCK_BOTTOM && location !== wcDocker.DOCK_TOP);
            parentSplitter.pane(1, splitter);
          }

          if (splitter) {
            this._splitterList.push(splitter);
            frame = new wcFrame(null, splitter, false);
            this._frameList.push(frame);
            if (location === wcDocker.DOCK_LEFT || location === wcDocker.DOCK_TOP) {
              splitter.pane(0, frame);
              splitter.pane(1, parentFrame);
              splitter.pos(0.4);
            } else {
              splitter.pane(0, parentFrame);
              splitter.pane(1, frame);
              splitter.pos(0.6);
            }

            frame.addPanel(widget);
          }
          return;
        }
      }
    }

    var splitter;
    if (this._center === this._root) {
      // The center is the root when no dock widgets have been docked yet.
      splitter = new wcSplitter(this.$container, this, location !== wcDocker.DOCK_BOTTOM && location !== wcDocker.DOCK_TOP);
      this._root = splitter;
    } else {
      // The parent of the center should be a splitter, we need to insert another one in between.
      var parent = this._center.parent();
      if (parent instanceof wcSplitter) {
        var left  = parent.pane(0);
        var right = parent.pane(1);
        if (left === this._center) {
          splitter = new wcSplitter(null, parent, location !== wcDocker.DOCK_BOTTOM && location !== wcDocker.DOCK_TOP);
          parent.pane(0, splitter);
        } else {
          splitter = new wcSplitter(null, parent, location !== wcDocker.DOCK_BOTTOM && location !== wcDocker.DOCK_TOP);
          parent.pane(1, splitter);
        }
      }
    }

    if (splitter) {
      this._splitterList.push(splitter);
      var frame = new wcFrame(null, splitter, false);
      this._frameList.push(frame);

      if (location === wcDocker.DOCK_LEFT || location === wcDocker.DOCK_TOP) {
        splitter.pane(0, frame);
        splitter.pane(1, this._center);
        splitter.findBestPos();
      } else {
        splitter.pane(0, this._center);
        splitter.pane(1, frame);
        splitter.findBestPos();
      }

      frame.addPanel(widget);
    }
  },

  // Attempts to insert a given dock widget into an already existing frame.
  // If insertion is not possible for any reason, the widget will be
  // placed in its own frame instead.
  // Params:
  //    widget        The widget to insert.
  //    location      The desired location for the widget.
  //    parentWidget  An optional widget to 'split', if not supplied the
  //                  new widget will split the center window.
  _addPanelGrouped: function(widget, location, parentWidget) {
    // Floating windows need no placement.
    if (location === wcDocker.DOCK_FLOAT) {
      var frame;
      if (this._floatingList.length) {
        frame = this._floatingList[this._floatingList.length-1];
      }
      if (!frame) {
        this._addPanelAlone(widget, location);
        return;
      }
      frame.addPanel(widget);
      return;
    }

    if (parentWidget) {
      var frame = parentWidget.parent();
      if (frame instanceof wcFrame) {
        frame.addPanel(widget);
        return;
      }
    }

    var needsHorizontal = location !== wcDocker.DOCK_BOTTOM;

    function __iterateParents(item) {
      // The last item will always be the center.
      if (item === this._center) {
        this._addPanelAlone(widget, location);
        return;
      }

      // Iterate through splitters. one side will always be another
      // frame, while the other will be either the center or another
      // splitter.
      if (item instanceof wcSplitter) {
        var left = item.pane(0);
        var right = item.pane(1);

        // Check if the orientation of the splitter is one that we want.
        if (item.isHorizontal() === needsHorizontal) {
          // Make sure the dock widget is on the proper side.
          if (left instanceof wcFrame && (location === wcDocker.DOCK_LEFT || location === wcDocker.DOCK_TOP)) {
            left.addPanel(widget);
            return;
          } else if (right instanceof wcFrame && (location === wcDocker.DOCK_RIGHT || location === wcDocker.DOCK_BOTTOM)) {
            right.addPanel(widget);
            return;
          }

          // This splitter was not valid, continue iterating through parents.
        }

        // If it isn't, iterate to which ever pane is not a dock widget.
        if (!(left instanceof wcFrame)) {
          __iterateParents.call(this, left);
        } else {
          __iterateParents.call(this, right);
        }
      }
    };

    __iterateParents.call(this, this._root);
  },

  // Registers a new docking panel type to be used later.
  // Params:
  //    name          The name for this new type.
  //    createFunc    The function that populates the contents of
  //                  a newly created dock widget of this type.
  //                  Params:
  //                    widget      The dock widget to populate.
  //    isPrivate     If true, this type will not appear to the user
  //                  as a window type to create.
  // Returns:
  //    true        The new type has been added successfully.
  //    false       Failure, the type name already exists.
  registerPanelType: function(name, createFunc, isPrivate) {
    for (var i = 0; i < this._dockWidgetTypeList.length; ++i) {
      if (this._dockWidgetTypeList[i].name === name) {
        return false;
      }
    }

    this._dockWidgetTypeList.push({
      name: name,
      create: createFunc,
      isPrivate: isPrivate,
    });

    var $menu = $('menu').find('menu');
    $menu.append($('<menuitem label="' + name + '">'));
    return true;
  },

  // Moves a docking panel from its current location to another.
  // Params:
  //    typeName      The type of widget to create.
  //    location      The location to 'try' docking at, as defined by
  //                  wcGLOBALS.DOCK_LOC enum.
  //    allowGroup    True to allow this widget to be tab groupped with
  //                  another already existing widget at that location.
  //                  If, for any reason, the widget can not fit at the
  //                  desired location, a floating window will be used.
  //    parentWidget  An optional widget to 'split', if not supplied the
  //                  new widget will split the center window.
  // Returns:
  //    widget        The widget that was created.
  //    false         The widget type does not exist.
  movePanel: function(widget, location, allowGroup, parentWidget) {
    var $elem = widget.$container;
    if (widget.parent() instanceof wcFrame) {
      $elem = widget.parent().$frame;
    }
    var offset = $elem.offset();
    var width  = $elem.width();
    var height = $elem.height();

    this.removePanel(widget);

    widget.size(width, height);
    if (allowGroup) {
      this._addPanelGrouped(widget, location, parentWidget);
    } else {
      this._addPanelAlone(widget, location, parentWidget);
    }

    var frame = widget.parent();
    if (frame) {
      frame.pos(offset.left + width/2 + 20, offset.top + height/2 + 20, true);
    }

    this._update();
    return widget;
  },

  // Add a new dock widget to the window of a given type.
  // Params:
  //    typeName      The type of widget to create.
  //    location      The location to 'try' docking at, as defined by
  //                  wcGLOBALS.DOCK_LOC enum.
  //    allowGroup    True to allow this widget to be tab grouped with
  //                  another already existing widget at that location.
  //                  If, for any reason, the widget can not fit at the
  //                  desired location, a floating window will be used.
  //    parentWidget  An optional widget to 'split', if not supplied the
  //                  new widget will split the center window.
  // Returns:
  //    widget        The widget that was created.
  //    false         The widget type does not exist.
  addPanel: function(typeName, location, allowGroup, parentWidget) {
    for (var i = 0; i < this._dockWidgetTypeList.length; ++i) {
      if (this._dockWidgetTypeList[i].name === typeName) {
        var widget = new wcPanel(typeName);
        this._dockWidgetTypeList[i].create(widget);
        if (allowGroup) {
          this._addPanelGrouped(widget, location, parentWidget);
        } else {
          this._addPanelAlone(widget, location, parentWidget);
        }
        this._update();
        return widget;
      }
    }

    return false;
  },

  // Removes a dock widget from the window.
  // Params:
  //    widget        The widget to remove.
  // Returns:
  //    true          The widget was removed.
  //    false         There was a problem.
  removePanel: function(widget) {
    if (!widget) {
      return false;
    }

    var parentFrame = widget.parent();
    if (parentFrame instanceof wcFrame) {
      var parentSplitter = parentFrame.parent();
      if (parentSplitter instanceof wcSplitter) {
        var left  = parentSplitter.pane(0);
        var right = parentSplitter.pane(1);
        var other;
        if (left === parentFrame) {
          other = right;
        } else {
          other = left;
        }

        var index = this._frameList.indexOf(parentFrame);
        if (index !== -1) {
          this._frameList.splice(index, 1);
        }

        index = this._splitterList.indexOf(parentSplitter);
        if (index !== -1) {
          this._splitterList.splice(index, 1);
        }

        parent = parentSplitter.parent();
        parentContainer = parentSplitter.container();
        parentSplitter.destroy();
        parentFrame.destroy();

        if (parent instanceof wcSplitter) {
          parent.removeChild(parentSplitter);
          if (!parent.pane(0)) {
            parent.pane(0, other);
          } else if (!parent.pane(1)) {
            parent.pane(1, other);
          }
        } else if (parent === this) {
          this._root = other;
          other.parent(this);
          other.container(parentContainer);
        }
        this._update();
        return true;
      } else if (parentSplitter === this) {
        for (var i = 0; i < this._floatingList.length; ++i) {
          if (this._floatingList[i] === parentFrame) {
            this._floatingList.splice(i, 1);
          }
        }

        var index = this._frameList.indexOf(parentFrame);
        if (index !== -1) {
          this._frameList.splice(index, 1);
        }

        parentFrame.destroy();
      }
    }
    return false;
  },

  // Updates the sizing of all widgets inside this window.
  _update: function() {
    if (this._root) {
      this._root._update();
    }

    for (var i = 0; i < this._floatingList.length; ++i) {
      this._floatingList[i]._update();
    }
  },

  // Retreives the center layout for the window.
  center: function() {
    return this._center.panel().layout();
  },
};