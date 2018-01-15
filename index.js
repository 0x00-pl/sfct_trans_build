let fs = require('fs')
let path = reqiure('path')
let mongodb = require('mongodb')
let { Promise } = require('es6-promise')
let child_process = require('child_process')
let process = require('process')


function get_file_list_in_path(path, config){
    return new Promise((resolve, reject)=>{
	fs.readdir(path, (err, file_list)=>{
	    if(err) { reject(err) }
	    else { resolve(file_list) }
	})
    })
}

function get_file_list_is_dir(path){
    return new Promise((resolve, reject)=>{
	fs.stat(path, (err, stat)=>{
	    if(err) { reject(err) }
	    else { resolve(stat.isDirectory()) }
	})
    })
}

function get_file_list_in_path_rec(path, config){
    get_file_list_in_path(path, config).then(file_list=>{
	return Promise.all(file_list.map(file_name=>{
	    let file_path = path.join(path, file_name)
	    return get_file_list_is_dir(file_path).then(isdir=>{
		if(isdir) { return get_file_list_in_path_rec(file_path, config) }
		else { return file_path }
	    }).then(file_tree=>Array.prototype.concat(...file_tree))
	})
    })
}

function get_file_list(src_path, config){
    "return .v file relative path base on src_path and dst_path."
    return get_file_list_in_path_rec(src_path, config).then(file_list=>{
	return file_list.filter(file_path=>file_path.endswith('.v'))
    }).then(file_list=>{
	return file_list.map(file_path=>path.relative(src_path, file_path))
    })
}

function read_file(src_path){
    return new Promise((resolve, reject)=>{
	fs.readFile(src_path, (err, data)=>{
	    if(err){ reject(err) }
	    else { resolve(data) }
	})
    })
}
function write_file(dst_path, data){
    return new Promise((resolve, reject)=>{
	fs.writeFIle(dst_path, data, (err)=>{
	    if(err) { reject(err) }
	    else { resolve(dst_path) }
	})
    })
}
// TODO
function parse_file(content){ return [] }
// TODO
function trans_block(block, db){ return block }

function trans_file(file_path, src_path, dst_path, db){
    let srcf = path.join(src_path, file_path)
    let dstf = path.join(dst_path, file_path)
    return read_file(srcf).then(content=>parse_file(content)).then(block_list=>{
	return Promise.all(block_list.map(block=>trans_block(block, db)))
    }).then(transed_block_list=>write_file(dstf, transed_block_list.join('')))
}

function make_html(dst_path){
    return new Promise((resolve, reject)=>{
	child_process.exec('make', {cwd: dst_path}, (err, stdout, stderr)=>{
	    if(err) { reject(err) }
	    else { resolve([stdout, stderr]) }
	})
    })
}

function connect_db(db_config){
    return mongodb.connect(db_config.mongourl)
}
// TODO
function reinit_db(db, src_path, db_config, config){
}

function init(src_path, db_config, config){
    return connct_db(db_config).then(db=>{
	return reinit_db(db, src_path, db_config, config)
    })
}

function main(src_path, dst_path, db_config, config){
    return get_file_list(src_path, config).then(file_list=>{
	return connect_db(db_config).then(db=>{
	    return Promise.all(file_list.map(file_path=>trans_file(file_path, src_path, dst_path, db)))
	})
    }).then(a=>make_html(dst_path)).catch(console.log)
}
