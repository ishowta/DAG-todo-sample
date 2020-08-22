import React, { useEffect } from 'react'
import { getRoomName, isRemoteMode } from '../util'
import {
  ToDoListWrapper,
  ToDoGraphWrapper,
  TutrialCard,
} from './styles/App.style'
import ToDoGraph from './ToDoGraph'
import AddToDo from './AddToDo'
import Footer from './Footer'
import ToDoList from './ToDoList'
import Viewer from './Viewer'
import { useSelector } from '../stores'
import { ToDo } from '../stores/todos'
import { VisibilityFilters } from '../stores/viewer'
import { useDispatch } from 'react-redux'
import { Dispatch } from 'redux'
import { PersistRemoteStoreAction } from '../middleware/persistRemoteStore'

const App: React.FC = () => {
  const dispatch = useDispatch<Dispatch<PersistRemoteStoreAction>>()
  const { todos, viewer } = useSelector((state) => state)
  const focusedTodo: ToDo | undefined = (() => {
    if (viewer.forcusedToDo === null) return undefined
    return todos.find((todo) => todo.id === viewer.forcusedToDo)
  })()
  const filteredToDos = (() => {
    switch (viewer.visibilityFilter) {
      case VisibilityFilters.SHOW_ALL:
        return todos
      case VisibilityFilters.SHOW_COMPLETED:
        return todos.filter((t) => t.completed)
      case VisibilityFilters.SHOW_ACTIVE:
        return todos.filter((t) => !t.completed)
    }
  })()

  useEffect(() => {
    isRemoteMode() &&
      dispatch({
        type: 'persistRemoteStore/CONNECT',
        payload: {
          path: `${process.env.REACT_APP_SERVER_ADDRESS}/${getRoomName()}`,
        },
      })
  }, [dispatch])

  return (
    <div>
      <ToDoListWrapper>
        {getRoomName() === null && (
          <TutrialCard>
            {`
                  使い方
  
                  入室
                  - ローカル：/
                  - ルーム：/ルーム名
  
                  操作
                  - タスクの追加：下の入力欄から
                  - 依存関係の追加：Shiftを押しながらD&D
                  - 依存関係の削除：矢印をクリック
                  - タスクの完了：タスク一覧のDONEをクリック
                  - タスクの削除：タスク一覧のDELETEをクリック
                  - メモをする：タスクをクリック→ビュワーのリンクをクリック（該当するScrapboxに飛びます）
  
                  表示
                  - 未完了のタスクだけ表示：Activeをクリック
                  - 完了したタスクだけ表示：Completedをクリック
                  - 全て表示：Allをクリック
                  `}
          </TutrialCard>
        )}
        <AddToDo />
        <Footer />
        {focusedTodo !== undefined && <Viewer todo={focusedTodo} />}
        <ToDoList todos={filteredToDos} />
      </ToDoListWrapper>
      <ToDoGraphWrapper>
        <ToDoGraph todos={filteredToDos} />
      </ToDoGraphWrapper>
    </div>
  )
}

export default App
