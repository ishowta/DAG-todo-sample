import React, { useState, useEffect } from 'react'
import { GraphView, INode, IEdge, GraphUtils } from 'react-digraph'
import { useDispatch } from 'react-redux'
import Lazy from 'lazy.js'
import { Dispatch } from 'redux'
import { DeepReadonly } from 'utility-types'
import ToDoGraphNodeConfig, {
  ToDoGraphNode,
  ToDoGraphEdge,
} from './ToDoGraphNodeConfig'

import { ToDo } from '../stores/todos'
import { comp, makeDictFromArray, bucket } from '../type-utils'
import { GraphInner } from './styles/ToDoGraph.style'
import { ToDoAction } from '../actions/todos'
import { ViewerAction } from '../actions/viewer'

// https://stackoverflow.com/questions/2057682/determine-pixel-length-of-string-in-javascript-jquery
let e: HTMLSpanElement
function getWidthOfText(txt: string, fontname = '', fontsize = '8px'): number {
  if (e === undefined) {
    e = document.createElement('span')
    document.body.appendChild(e)
  }
  e.style.display = 'table'
  e.style.fontSize = fontsize
  e.style.fontFamily = fontname
  e.innerText = txt
  const res = e.offsetWidth
  e.style.display = 'none'
  return res
}

function chunk(str: string, chunkSize: number): string[] {
  const strSize = getWidthOfText(str)
  const chunkCount = Math.ceil(strSize / chunkSize)
  const chunkLength = Math.ceil(str.length / chunkCount)
  return Lazy.range(chunkCount)
    .map((i) =>
      str.slice(chunkLength * i, Math.min(chunkLength * (i + 1), str.length))
    )
    .toArray()
}

const ToDoGraphNodeText: React.FC<DeepReadonly<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: { title: string }
  isSelected: boolean
}>> = (props) => {
  const {
    data: { title },
    isSelected,
  } = props
  const lineOffset = 18
  const className = GraphUtils.classNames('node-text', {
    selected: isSelected,
  })

  const renderText = () => {
    const lines = chunk(title, 100)
    return lines.slice(0, 2).map((text, i) => (
      // eslint-disable-next-line react/no-array-index-key
      <tspan x={0} y={lineOffset * i} fontSize="12px" key={`${text} + ${i}`}>
        {text + (i === 1 && lines.length > 2 ? '...' : '')}
      </tspan>
    ))
  }

  return (
    <text className={`${className} wraptext`} textAnchor="middle">
      {title === '' ? <></> : renderText()}
      {title === '' ? <></> : <title>{title}</title>}
    </text>
  )
}

type Node = {
  index: number
  view?: ToDoGraphNode
  data: ToDo
  parentNodes: Node[]
  childNodes: Node[]
}
type Edge = {
  view?: ToDoGraphEdge
  source: Node
  target: Node
}
class Graph {
  nodeList: Node[]

  edgeList: Edge[]

  depthList: number[]

  nodeNth: number[]

  constructor(todos: DeepReadonly<ToDo[]>) {
    this.nodeList = todos.map((todo: ToDo, index: number) => ({
      index,
      data: todo,
      parentNodes: [],
      childNodes: [],
    }))

    this.nodeList.forEach((node) => {
      node.childNodes = node.data.nextToDos.map((nextTodoId) => {
        const nextToDo = this.nodeList.find((n) => n.data.id === nextTodoId)
        if (nextToDo === undefined) throw new Error('Detect broken ToDo data')
        return nextToDo
      })
      node.childNodes.forEach((childNode) => {
        childNode.parentNodes.push(node)
      })
    })

    this.edgeList = this.nodeList.flatMap((node) =>
      node.childNodes.map((childNode) => {
        return {
          source: node,
          target: childNode,
        }
      })
    )

    // Construct DAG View

    // Calcurate DAG depth
    this.depthList = this.calcDepthList()

    // Calcurate position in n depth
    this.nodeNth = this.calcNodeNth(this.depthList)

    // Activeなタスクを探してマークをつける
    const activeNodeList = this.nodeList.map(
      (n) =>
        n.data.completed === false &&
        n.parentNodes.every((p) => p.data.completed)
    )

    // nodes
    this.nodeList.forEach((node, i) => {
      node.view = {
        id: node.data.id,
        title: node.data.text,
        x: this.nodeNth[i] * 200 + 200,
        y: this.depthList[i] * 200 + 300,
        type: node.data.completed
          ? 'DONE'
          : activeNodeList[i]
          ? 'ACTIVE'
          : 'NORMAL',
      }
    })

    // edges
    this.edgeList.forEach((edge) => {
      edge.view = {
        source: edge.source.data.id.toString(),
        target: edge.target.data.id.toString(),
        type: 'NORMAL',
      }
    })
  }

  private calcDepthList(): number[] {
    const depthList: number[] = this.nodeList.map(() => 0)

    const updateDepth = (node: Node) => {
      node.childNodes.forEach((childNode) => {
        if (depthList[node.index] >= depthList[childNode.index]) {
          depthList[childNode.index] = depthList[node.index] + 1
          updateDepth(childNode)
        }
      })
    }

    this.nodeList.forEach((node) => updateDepth(node))

    return depthList
  }

  private calcNodeNth(depthList: number[]): number[] {
    const nodeNth = this.nodeList.map(() => 0)
    const maxDepth = Math.max(...depthList, 0) + 1
    const nDepthNodeList: DeepReadonly<Node[][]> = bucket(
      depthList,
      maxDepth,
      (depth, i) => {
        return { index: depth, value: this.nodeList[i] }
      }
    )

    // それぞれの深さのノードを、親ノードのもっとも右の位置でソートしてから追加していく
    nDepthNodeList.forEach((nDepthNodes) => {
      // 親ノードのもっとも右の位置
      const parentMaxNth: DeepReadonly<{
        [key: string]: number
      }> = makeDictFromArray(nDepthNodes, (n) => {
        return {
          key: n.index.toString(),
          value: Math.max(...n.parentNodes.map((p) => nodeNth[p.index]), 0),
        }
      })

      // ソート
      const sortedNDepthNodes: DeepReadonly<
        Node[]
      > = nDepthNodes
        .slice()
        .sort((a, b) => comp(parentMaxNth[a.index], parentMaxNth[b.index]))

      // 左から追加していく
      let currentNth = 0
      sortedNDepthNodes.forEach((node) => {
        currentNth = Math.max(currentNth, parentMaxNth[node.index])
        nodeNth[node.index] = currentNth
        currentNth += 1
      })
    })
    return nodeNth
  }
}

const ToDoGraph: React.FC<DeepReadonly<{
  todos: ToDo[]
}>> = (props) => {
  const { todos } = props
  const dispatch: Dispatch<ToDoAction | ViewerAction> = useDispatch()
  const [graph, updateGraph] = useState(new Graph(todos))

  useEffect(() => {
    updateGraph(new Graph(todos)) // Slow
  }, [todos])

  /*
   * Handlers/Interaction
   */

  const checkHasId = (obj: unknown): obj is { id: number } => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return typeof (obj as { id: number }).id === 'number'
  }

  const findEdge = (viewEdge: IEdge) =>
    graph.edgeList.find(
      (edge) =>
        edge.source.data.id.toString() === viewEdge.source &&
        edge.target.data.id.toString() === viewEdge.target
    )

  // Called by 'drag' handler, etc..
  // to sync updates from D3 with the graph
  const onUpdateNode = (_viewNode: INode) => {}

  // Node 'mouseUp' handler
  const onSelectNode = (viewNode: INode | null) => {
    if (viewNode !== null) {
      if (!checkHasId(viewNode)) throw new Error('type error')
      // dispatch(toggleToDo(viewNode.id))
      dispatch({
        type: 'viewer/FOCUS_TODO',
        payload: { id: Number(viewNode.id) },
      })
    }
  }

  // Edge 'mouseUp' handler
  // Remove the edge at select it
  const onSelectEdge = (edge: IEdge) => {
    dispatch({
      type: 'todos/REMOVE_DEPENDENCE',
      payload: {
        fromId: Number(edge.source),
        toId: Number(edge.target),
      },
    })
  }

  // Updates the graph with a new node
  const onCreateNode = (_x: number, _y: number) => {}

  // Deletes a node from the graph
  const onDeleteNode = (_viewNode: INode) => {}

  // Create or Delete a new edge between two nodes
  const onCreateEdge = (sourceViewNode: INode, targetViewNode: INode) => {
    if (!checkHasId(sourceViewNode) || !checkHasId(targetViewNode))
      throw new Error('type error')
    const viewEdge: ToDoGraphEdge = {
      source: sourceViewNode.id.toString(),
      target: targetViewNode.id.toString(),
      type: 'NORMAL',
    }

    // 既にあればなにもしない
    if (findEdge(viewEdge) !== undefined) {
      return
    }

    // 閉路ができてないかチェック

    let findCloseNetworkRing = false

    const searchCloseNetwork = (currentNode: Node, marking: boolean[]) => {
      currentNode.childNodes.forEach((childNode) => {
        if (marking[childNode.index]) {
          findCloseNetworkRing = true
          return
        }
        const newMarking = [...marking]
        newMarking[childNode.index] = true
        searchCloseNetwork(childNode, newMarking)
      })
    }

    graph.depthList.forEach((depth, index) => {
      if (depth === 0) {
        const marking = graph.nodeList.map(() => false)
        marking[index] = true
        searchCloseNetwork(graph.nodeList[index], marking)
      }
    })

    const isLoop = viewEdge.source === viewEdge.target

    if (findCloseNetworkRing === false && isLoop === false) {
      dispatch({
        type: 'todos/ADD_DEPENDENCE',
        payload: {
          fromId: Number(viewEdge.source),
          toId: Number(viewEdge.target),
        },
      })
    }
  }

  const onSwapEdge = (
    _sourceViewNode: INode,
    _targetViewNode: INode,
    _viewEdge: IEdge
  ) => {}

  // Called when an edge is deleted
  const onDeleteEdge = (_viewEdge: IEdge) => {}

  return (
    <GraphInner id="graph">
      <GraphView
        nodeKey="id"
        nodes={graph.nodeList.map((node) => node.view)}
        edges={graph.edgeList.map((edge) => edge.view)}
        selected={[]}
        nodeTypes={ToDoGraphNodeConfig.NodeTypes}
        nodeSubtypes={ToDoGraphNodeConfig.NodeSubtypes}
        edgeTypes={ToDoGraphNodeConfig.EdgeTypes}
        onSelectNode={onSelectNode}
        onCreateNode={onCreateNode}
        onUpdateNode={onUpdateNode}
        onDeleteNode={onDeleteNode}
        onSelectEdge={onSelectEdge}
        onCreateEdge={onCreateEdge}
        onSwapEdge={onSwapEdge}
        canDeleteNode={() => false}
        canDeleteEdge={() => false}
        onDeleteEdge={onDeleteEdge}
        maxTitleChars={Infinity}
        nodeSize={150}
        zoomDelay={500}
        zoomDur={500}
        renderNodeText={(data, id, isSelected) => {
          const isValidData = (d: unknown): d is { title: string } =>
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            typeof (d as { title: string }).title === 'string'
          if (!isValidData(data)) throw new Error('type error')
          return <ToDoGraphNodeText data={data} isSelected={isSelected} />
        }}
      />
    </GraphInner>
  )
}

export default ToDoGraph
